-- Fork: a book whose file changed on the device links to its BookOrbit file by Calibre uuid or by
-- its previous path, through a second regular match check. Matched hashes are never touched.

local SETTINGS_DIR = "/settings"
local files = {}
local settings_store = {}
local calibre_json = {}

local function addFile(path, size)
    files[path] = { mode = "file", modification = 1, size = size or 10 }
end

package.loaded["logger"] = { dbg = function() end, info = function() end, warn = function() end }
package.loaded["datastorage"] = { getSettingsDir = function() return SETTINGS_DIR end }
package.loaded["libs/libkoreader-lfs"] = {
    attributes = function(path, field)
        local entry = files[path]
        if not entry then return nil end
        if field then return entry[field] end
        return entry
    end,
    dir = function(dir)
        local names = {}
        for path in pairs(files) do
            local parent, name = path:match("^(.+)/([^/]+)$")
            if parent == dir then table.insert(names, name) end
        end
        local index = 0
        return function()
            index = index + 1
            return names[index]
        end, nil
    end,
}
package.loaded["luasettings"] = {
    open = function(_self, path)
        settings_store[path] = settings_store[path] or {}
        local data = settings_store[path]
        return {
            readSetting = function(_s, key) return data[key] end,
            saveSetting = function(_s, key, value) data[key] = value end,
            flush = function() end,
        }
    end,
}
package.loaded["rapidjson"] = {
    load_calibre = function(path) return calibre_json[path] end,
}
local reader_ui = { instance = nil }
package.loaded["apps/reader/readerui"] = reader_ui

package.path = "koreader-plugin/bookorbit.koplugin/?.lua;" .. package.path

local Calibre = require("bookorbit_fork_calibre")
local Link = require("bookorbit_fork_link")

local UUID = "41499828-334d-467e-93ca-cc81d7ec47ba"
local OLD_HASH = string.rep("a", 32)
local NEW_HASH = string.rep("b", 32)
local BOOK_PATH = "/mnt/onboard/Fanfic/Second Child Of Agni - SuperSadSalad.epub"

local function reset()
    files = {}
    settings_store = {}
    calibre_json = {}
    reader_ui.instance = nil
    Calibre.resetCache()
    Link.resetForTests()
end

-- A fake server: hashes it already knows, files it links when a candidate names one.
local function newServer(known)
    local server = { known = known or {}, calls = {}, resolve_calls = {}, resolve_status = nil, uuids = {} }
    server.original = function(_client, hashes, candidates)
        table.insert(server.calls, { hashes = hashes })
        local matches = {}
        for _, hash in ipairs(hashes) do
            local candidate = candidates and candidates[hash]
            local file_id = server.known[hash]
            if not file_id and candidate and candidate.book_file_id
                    and (candidate.source == "file" or candidate.source == "current_file") then
                file_id = candidate.book_file_id
                server.known[hash] = file_id
            end
            if file_id then table.insert(matches, { hash = hash, bookFileId = file_id, bookId = file_id * 10 }) end
        end
        return { matches = matches, libraryVersion = "v" .. #server.calls }
    end
    server.client = {
        server_url = "http://server",
        username = "reader",
        request = function(_self, method, path, body)
            table.insert(server.resolve_calls, { method = method, path = path, uuids = body.uuids })
            if server.resolve_status then return nil, server.resolve_status end
            local matches = {}
            for _, uuid in ipairs(body.uuids) do
                if server.uuids[uuid] then table.insert(matches, { uuid = uuid, bookFileId = server.uuids[uuid] }) end
            end
            return { matches = matches }
        end,
    }
    return server
end

local function check(server, hashes, candidates)
    return Link.matchCheck(server.original, server.client, hashes, candidates)
end

-- A hash the server already knows needs one request and no lookup.
reset()
local server = newServer({ [OLD_HASH] = 5 })
local body = check(server, { OLD_HASH }, { [OLD_HASH] = { file = BOOK_PATH, source = "file" } })
assert(#server.calls == 1, "a matched hash costs one match check")
assert(#server.resolve_calls == 0, "a matched hash is not looked up")
assert(body.matches[1].bookFileId == 5, "the regular match is returned untouched")

-- A changed file links by the path the same book had before.
local candidates = { [NEW_HASH] = { file = BOOK_PATH, source = "file", title = "Second Child" } }
body = check(server, { NEW_HASH }, candidates)
assert(#server.calls == 3, "an unmatched hash gets one more match check")
assert(server.calls[3].hashes[1] == NEW_HASH, "only the linkable hash is sent again")
assert(candidates[NEW_HASH].book_file_id == 5, "the candidate names the file the path had")
assert(#body.matches == 1 and body.matches[1].hash == NEW_HASH, "the new match is added to the result")
assert(body.libraryVersion == "v3", "the library version comes from the latest check")
local account = settings_store[SETTINGS_DIR .. "/" .. Link.STATE_FILE].accounts["http://server|reader"]
assert(account.paths[BOOK_PATH].hash == NEW_HASH, "the path now remembers the new hash")

-- A Calibre uuid wins over the path and is asked from the server in one batch.
reset()
addFile("/mnt/onboard/.metadata.calibre", 100)
calibre_json["/mnt/onboard/.metadata.calibre"] = {
    { lpath = "Fanfic/Second Child Of Agni - SuperSadSalad.epub", uuid = UUID:upper() },
    { lpath = "Fanfic/Other.epub", uuid = "not-a-uuid" },
}
server = newServer({})
server.uuids[UUID] = 42
candidates = { [NEW_HASH] = { file = BOOK_PATH, source = "statistics" } }
body = check(server, { NEW_HASH }, candidates)
assert(#server.resolve_calls == 1 and server.resolve_calls[1].uuids[1] == UUID, "the uuid from .metadata.calibre is resolved")
assert(server.resolve_calls[1].path == "/koreader/plugin/fork/calibre-resolve", "the fork endpoint is used")
assert(candidates[NEW_HASH].book_file_id == 42, "the resolved file is used")
assert(candidates[NEW_HASH].source == "file", "the server only links file candidates")
assert(body.matches[1].bookFileId == 42, "a brand new Calibre copy links on its first sync")

-- An unknown uuid and an unknown path leave the hash unmatched with no extra match check.
reset()
server = newServer({})
candidates = { [NEW_HASH] = { file = "/mnt/onboard/Elsewhere/book.epub", source = "file" } }
body = check(server, { NEW_HASH }, candidates)
assert(#server.calls == 1, "nothing to link means no second check")
assert(candidates[NEW_HASH].book_file_id == nil, "the candidate is left as it was")

-- An open book has no path in its candidate; the open document supplies the path and identifiers.
reset()
server = newServer({})
server.uuids[UUID] = 7
reader_ui.instance = {
    document = {
        file = "/mnt/onboard/Downloads/book.epub",
        getProps = function() return { identifiers = "URL:https://example.com\ncalibre:" .. UUID } end,
    },
}
candidates = { [NEW_HASH] = { source = "current_file" } }
body = check(server, { NEW_HASH }, candidates)
assert(candidates[NEW_HASH].book_file_id == 7, "the open book's calibre identifier is used")
assert(candidates[NEW_HASH].source == "current_file", "the open-book source is kept")
assert(body.matches[1].bookFileId == 7, "the open book links")

-- A server without the fork endpoint is asked once, and path linking still works.
reset()
addFile("/mnt/onboard/.metadata.calibre", 100)
calibre_json["/mnt/onboard/.metadata.calibre"] = { { lpath = "Fanfic/Second Child Of Agni - SuperSadSalad.epub", uuid = UUID } }
server = newServer({ [OLD_HASH] = 5 })
server.resolve_status = 404
check(server, { OLD_HASH }, { [OLD_HASH] = { file = BOOK_PATH, source = "file" } })
candidates = { [NEW_HASH] = { file = BOOK_PATH, source = "file" } }
check(server, { NEW_HASH }, candidates)
assert(candidates[NEW_HASH].book_file_id == 5, "path linking works without the fork endpoint")
check(server, { string.rep("c", 32) }, { [string.rep("c", 32)] = { file = BOOK_PATH, source = "file" } })
assert(#server.resolve_calls == 1, "an endpoint that answered 404 is not asked again")

-- Books matched before this code was installed are seeded from upstream's sync state.
reset()
settings_store[SETTINGS_DIR .. "/bookorbit_sync_state.lua"] = {
    books = { [OLD_HASH] = { file = BOOK_PATH, fileId = 9, bookId = 90 } },
}
addFile(SETTINGS_DIR .. "/bookorbit_sync_state.lua")
server = newServer({})
candidates = { [NEW_HASH] = { file = BOOK_PATH, source = "file" } }
check(server, { NEW_HASH }, candidates)
assert(candidates[NEW_HASH].book_file_id == 9, "a path from upstream's state links the changed file")

-- A failed regular check is returned as it was, with no fork work.
reset()
server = newServer({})
local failing = function() return nil, 500, { message = "boom" } end
local failed_body, failed_err = Link.matchCheck(failing, server.client, { NEW_HASH }, { [NEW_HASH] = { file = BOOK_PATH } })
assert(failed_body == nil and failed_err == 500, "errors pass through")
assert(#server.resolve_calls == 0, "no lookups after a failed check")

-- Calibre identifiers are read case-insensitively and validated.
assert(Calibre.uuidFromIdentifiers("CALIBRE:" .. UUID:upper()) == UUID, "identifier scheme and uuid are normalised")
assert(Calibre.uuidFromIdentifiers("calibre:3234") == nil, "a numeric calibre id is not a uuid")

print("bookorbit_fork_link_test: ok")
