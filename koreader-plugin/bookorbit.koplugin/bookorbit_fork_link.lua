--[[--
Fork: links a book whose file changed on the device to its BookOrbit file.

The plugin keys every book by the hash of its file, so a fic that Calibre sends again after an
update looks like a new, unknown book. After the regular match check, each hash it could not match
gets the BookOrbit file it belongs to, found by the book's Calibre uuid (asked from the server) or
else by the path the same book had before. A second match check with that file id lets the server
create the link through its own existing path; already matched hashes are never touched.

The path index is this fork's own settings file, so upstream's sync state is only ever read.
]]
local DataStorage = require("datastorage")
local LuaSettings = require("luasettings")
local lfs = require("libs/libkoreader-lfs")

local Calibre = require("bookorbit_fork_calibre")

local Link = {}

local function log(level, ...)
    local ok, logger = pcall(require, "logger")
    if ok and type(logger) == "table" and type(logger[level]) == "function" then pcall(logger[level], ...) end
end

Link.STATE_FILE = "bookorbit_fork_state.lua"
Link.RESOLVE_PATH = "/koreader/plugin/fork/calibre-resolve"
local RESOLVE_BATCH = 500

-- server_url -> true once the server answered that it has no resolve endpoint.
local resolve_unsupported = {}

local function settingsPath(name)
    return DataStorage:getSettingsDir() .. "/" .. name
end

local function accountKey(client)
    return tostring(client.server_url or "") .. "|" .. tostring(client.username or "")
end

-- Upstream's sync state already knows the path and file id of every matched book; reading it once
-- lets books that changed before this fork code was installed relink by path too.
local function seedFromUpstreamState()
    local paths = {}
    local dir = DataStorage:getSettingsDir()
    local ok, iter, dir_obj = pcall(lfs.dir, dir)
    if not ok then return paths end
    for name in iter, dir_obj do
        if name:match("^bookorbit_sync_state.*%.lua$") then
            local read_ok, settings = pcall(LuaSettings.open, LuaSettings, dir .. "/" .. name)
            local books = read_ok and settings:readSetting("books") or nil
            for hash, book in pairs(type(books) == "table" and books or {}) do
                if type(book) == "table" and type(book.file) == "string" and book.fileId then
                    paths[book.file] = paths[book.file] or { bookFileId = book.fileId, bookId = book.bookId, hash = hash }
                end
            end
        end
    end
    return paths
end

local function openAccount(client)
    local settings = LuaSettings:open(settingsPath(Link.STATE_FILE))
    local accounts = settings:readSetting("accounts") or {}
    local key = accountKey(client)
    local account = accounts[key]
    if type(account) ~= "table" then
        account = { paths = seedFromUpstreamState() }
        accounts[key] = account
        settings:saveSetting("accounts", accounts)
        settings:flush()
    end
    account.paths = account.paths or {}
    return settings, accounts, account
end

local function currentDocument()
    local ok, ReaderUI = pcall(require, "apps/reader/readerui")
    local document = ok and ReaderUI and ReaderUI.instance and ReaderUI.instance.document
    if not document or type(document.file) ~= "string" then return nil, nil end
    local props_ok, props = pcall(function() return document:getProps() end)
    return document.file, props_ok and type(props) == "table" and props.identifiers or nil
end

-- The device path a candidate stands for. An open-book check carries no path, only one hash.
local function candidatePath(hashes, candidate)
    if type(candidate.file) == "string" then return candidate.file, nil end
    if candidate.source == "current_file" and #hashes == 1 then return currentDocument() end
    return nil, nil
end

local function useFile(candidate, book_file_id)
    candidate.book_file_id = book_file_id
    if candidate.source ~= "file" and candidate.source ~= "current_file" then candidate.source = "file" end
end

local function resolveUuids(client, uuids)
    local found = {}
    if #uuids == 0 or resolve_unsupported[client.server_url or ""] then return found end
    for offset = 1, #uuids, RESOLVE_BATCH do
        local batch = { unpack(uuids, offset, math.min(offset + RESOLVE_BATCH - 1, #uuids)) }
        local body, err = client:request("POST", Link.RESOLVE_PATH, { uuids = batch })
        if not body then
            if err == 404 then resolve_unsupported[client.server_url or ""] = true end
            log("warn", "BookOrbit fork: calibre resolve failed:", err)
            return found
        end
        for _, match in ipairs(type(body.matches) == "table" and body.matches or {}) do
            if type(match) == "table" and Calibre.isUuid(match.uuid) and match.bookFileId then
                found[match.uuid:lower()] = match.bookFileId
            end
        end
    end
    return found
end

--- Gives each unmatched candidate the BookOrbit file it belongs to. Returns the hashes it filled in.
function Link.enrich(client, hashes, candidates)
    local filled = {}
    if type(candidates) ~= "table" or #hashes == 0 then return filled end
    Calibre.forgetMisses()
    local _settings, _accounts, account = openAccount(client)

    local by_uuid, uuids, by_path = {}, {}, {}
    for _, hash in ipairs(hashes) do
        local candidate = candidates[hash]
        if type(candidate) == "table" and not candidate.book_file_id then
            local path, identifiers = candidatePath(hashes, candidate)
            local uuid = (path and Calibre.uuidForPath(path)) or Calibre.uuidFromIdentifiers(identifiers)
            if uuid then
                if not by_uuid[uuid] then
                    by_uuid[uuid] = {}
                    table.insert(uuids, uuid)
                end
                table.insert(by_uuid[uuid], hash)
            end
            local known = path and account.paths[path]
            if type(known) == "table" and known.bookFileId and known.hash ~= hash then by_path[hash] = known.bookFileId end
        end
    end

    local resolved = resolveUuids(client, uuids)
    local seen = {}
    for uuid, file_id in pairs(resolved) do
        for _, hash in ipairs(by_uuid[uuid] or {}) do
            useFile(candidates[hash], file_id)
            seen[hash] = true
            table.insert(filled, hash)
        end
    end
    for _, hash in ipairs(hashes) do
        if not seen[hash] and by_path[hash] then
            useFile(candidates[hash], by_path[hash])
            table.insert(filled, hash)
        end
    end
    return filled
end

--- Remembers the path of every matched book, so the next version of its file links by path.
function Link.learn(client, hashes, candidates, body)
    if type(candidates) ~= "table" or type(body) ~= "table" or type(body.matches) ~= "table" then return end
    local settings, accounts, account = openAccount(client)
    local changed = false
    for _, match in ipairs(body.matches) do
        local candidate = type(match) == "table" and candidates[match.hash]
        local path = type(candidate) == "table" and candidatePath(hashes, candidate) or nil
        if path and match.bookFileId then
            local known = account.paths[path]
            if type(known) ~= "table" or known.hash ~= match.hash or known.bookFileId ~= match.bookFileId then
                account.paths[path] = { bookFileId = match.bookFileId, bookId = match.bookId, hash = match.hash }
                changed = true
            end
        end
    end
    if changed then
        settings:saveSetting("accounts", accounts)
        settings:flush()
    end
end

--- Wraps a match check: the regular check first, then one more for the hashes this module could link.
function Link.matchCheck(original, client, hashes, candidates)
    local body, err, errbody = original(client, hashes, candidates)
    if type(body) ~= "table" or type(candidates) ~= "table" then return body, err, errbody end

    local ok, fork_err = pcall(function()
        local matched = {}
        for _, match in ipairs(type(body.matches) == "table" and body.matches or {}) do
            if type(match) == "table" and match.hash then matched[match.hash] = true end
        end
        local unmatched = {}
        for _, hash in ipairs(hashes or {}) do
            if not matched[hash] then table.insert(unmatched, hash) end
        end
        local filled = Link.enrich(client, unmatched, candidates)
        if #filled > 0 then
            local again = original(client, filled, candidates)
            if type(again) == "table" and type(again.matches) == "table" then
                body.matches = body.matches or {}
                for _, match in ipairs(again.matches) do table.insert(body.matches, match) end
                body.libraryVersion = again.libraryVersion or body.libraryVersion
                log("info", "BookOrbit fork: linked", #again.matches, "of", #filled, "changed books")
            end
        end
        Link.learn(client, hashes or {}, candidates, body)
    end)
    if not ok then log("warn", "BookOrbit fork: linking skipped:", fork_err) end
    return body, err, errbody
end

function Link.resetForTests()
    resolve_unsupported = {}
end

return Link
