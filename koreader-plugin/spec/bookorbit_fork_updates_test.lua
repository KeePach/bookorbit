-- Fork: Wi-Fi updates find changed books, download them, check the hash and swap them in at the
-- same path, keeping KOReader's sidecar, the fanficupdate baseline and upstream's state in step.

package.loaded["logger"] = { dbg = function() end, info = function() end, warn = function() end }
package.path = "koreader-plugin/bookorbit.koplugin/?.lua;" .. package.path

local function readAll(path)
    local file = io.open(path, "rb")
    if not file then return nil end
    local content = file:read("*a")
    file:close()
    return content
end

local function writeAll(path, content)
    local file = assert(io.open(path, "wb"))
    file:write(content)
    file:close()
end

local ROOT = os.tmpname()
os.remove(ROOT)
assert(os.execute("mkdir -p '" .. ROOT .. "/Fanfic' '" .. ROOT .. "/settings'"))

-- Fakes. A file's "partial md5" is its content, which keeps hashes readable in the asserts.
local mtimes = {}
local fake_lfs = {
    attributes = function(path, field)
        local content = readAll(path)
        if not content then return nil end
        local attributes = { mode = "file", size = #content, modification = mtimes[path] or 1 }
        if field then return attributes[field] end
        return attributes
    end,
}
local sidecars = {}
local fake_docsettings = {
    hasSidecarFile = function(_self, path) return sidecars[path] ~= nil end,
    open = function(_self, path)
        local data = sidecars[path]
        return {
            readSetting = function(_s, key) return data[key] end,
            saveSetting = function(_s, key, value) data[key] = value end,
            flush = function() data.flushed = true end,
        }
    end,
}
local luasettings_files = {}
local fake_luasettings = {
    open = function(_self, path)
        luasettings_files[path] = luasettings_files[path] or {}
        local data = luasettings_files[path]
        return {
            readSetting = function(_s, key) return data[key] end,
            saveSetting = function(_s, key, value) data[key] = value end,
            flush = function() end,
        }
    end,
}
local state_calls = {}
package.loaded["bookorbit_state_manager"] = {
    repairFileIdentity = function(...) table.insert(state_calls, { "repair", ... }) end,
    linkFile = function(...) table.insert(state_calls, { "link", ... }) end,
}
local read_hashes, stats_error = {}, nil
package.loaded["bookorbit_stats_reader"] = {
    openSession = function()
        return {
            select = function(_self, _sql, params)
                if stats_error then return nil, stats_error end
                return read_hashes[params[1]] and { { 1 } } or nil
            end,
            close = function() end,
        }
    end,
}

local Updates = require("bookorbit_fork_updates")
Updates.deps.lfs = fake_lfs
Updates.deps.util = { partialMD5 = function(path) return readAll(path) end }
Updates.deps.DocSettings = fake_docsettings
Updates.deps.DataStorage = { getSettingsDir = function() return ROOT .. "/settings" end }
Updates.deps.LuaSettings = fake_luasettings

-- A fake BookOrbit server: file id -> { hash, content } and the requests it saw.
local function newServer(files)
    local server = { files = files, requests = {}, downloads = {} }
    server.client = {
        request = function(_self, method, path, body)
            table.insert(server.requests, { method = method, path = path, body = body })
            if path == Updates.CHECK_PATH then
                local items = {}
                for _, item in ipairs(body.items) do
                    local file = server.files[item.bookFileId]
                    if not file then
                        table.insert(items, { bookFileId = item.bookFileId, status = "missing" })
                    elseif file.out_of_scope then
                        table.insert(items, { bookFileId = item.bookFileId, status = "out_of_scope" })
                    elseif file.content == item.hash then
                        table.insert(items, { bookFileId = item.bookFileId, status = "current" })
                    else
                        table.insert(items, { bookFileId = item.bookFileId, status = "updated", bookId = file.bookId,
                            title = file.title, fileHash = file.content, sizeBytes = #file.content, mtimeMs = file.mtimeMs })
                    end
                end
                return { items = items }
            elseif path == Updates.RELEASE_PATH then
                return { released = #body.items }
            end
            return nil, 404
        end,
        downloadBlocking = function(_self, path, local_path, opts)
            table.insert(server.downloads, { path = path, local_path = local_path, opts = opts })
            local id = tonumber(path:match("/files/(%d+)/original$"))
            local content = server.corrupt and "corrupted" or server.files[id].content
            writeAll(opts.temp_path, content)
            return { temp_path = opts.temp_path, hash = content }
        end,
    }
    return server
end

local FIC = ROOT .. "/Fanfic/Fic - Author.epub"
local CURRENT = ROOT .. "/Fanfic/Current - Author.epub"
local OTHER = ROOT .. "/Fanfic/Novel - Author.epub"
local GONE = ROOT .. "/Fanfic/Gone - Author.epub"

writeAll(FIC, "calibre-copy-v1")
writeAll(CURRENT, "same-as-server")
writeAll(OTHER, "novel-old")
local account = {
    paths = {
        [FIC] = { bookFileId = 1, bookId = 10, hash = "calibre-copy-v1" },
        [CURRENT] = { bookFileId = 2, bookId = 20, hash = "same-as-server" },
        [OTHER] = { bookFileId = 3, bookId = 30, hash = "novel-old" },
        [GONE] = { bookFileId = 4, bookId = 40, hash = "whatever" },
    },
}
-- Noon UTC, so the local date is the same in every timezone the spec may run in.
local NOV_20 = os.time({ year = 2026, month = 11, day = 20, hour = 12 }) * 1000
local server = newServer({
    [1] = { bookId = 10, title = "Fic", content = "bookorbit-copy-v2", mtimeMs = NOV_20 },
    [2] = { bookId = 20, title = "Current", content = "same-as-server" },
    [3] = { bookId = 30, title = "Novel", content = "novel-new", out_of_scope = true },
})

-- Only books that still exist are asked about, in the chosen libraries.
local pending, current = Updates.find(server.client, account, { 7 })
local check = server.requests[1]
assert(check.path == Updates.CHECK_PATH and check.body.libraryIds[1] == 7, "the chosen libraries are sent")
assert(#check.body.items == 3, "a path that no longer exists is not checked")
assert(current == 1, "the current book is counted")
assert(#pending == 1, "only the changed book in scope is pending")
local item = pending[1]
assert(item.path == FIC and item.oldHash == "calibre-copy-v1" and item.newHash == "bookorbit-copy-v2", "the pending book carries both hashes")
assert(item.title == "Fic" and item.bookId == 10, "the server's title and book id are used")
assert(item.contentMtimeMs == NOV_20, "the time BookOrbit's file changed comes along")

-- A stale index hash whose file already matches the server is only corrected.
writeAll(OTHER, "novel-new")
server.files[3].out_of_scope = nil
account.paths[OTHER].hash = "stale"
pending = Updates.find(server.client, account, { 7 })
assert(#pending == 1 and pending[1].path == FIC, "a file that already matches is not downloaded")
assert(account.paths[OTHER].hash == "novel-new", "its index hash is corrected")

-- Download, check and swap in.
sidecars[FIC] = { summary = { status = "complete", modified = "2026-11-01" }, percent_finished = 1.0, partial_md5_checksum = "calibre-copy-v1" }
local baseline_file = ROOT .. "/settings/fanficupdate.lua"
writeAll(baseline_file, "-- exists")
luasettings_files[baseline_file] = { files = { [FIC] = { size = 15, mtime = 1 } } }

local temp = assert(Updates.download(server.client, item))
assert(temp == ROOT .. "/Fanfic/.Fic - Author.epub.bookorbit-part", "the download goes to a hidden file next to the book")
assert(server.downloads[1].path == "/koreader/plugin/fork/files/1/original", "the original file is downloaded")
assert(server.downloads[1].opts.expected_bytes == #"bookorbit-copy-v2", "the announced size is enforced")

local result = assert(Updates.install(account, item, temp))
assert(readAll(FIC) == "bookorbit-copy-v2", "the book now holds BookOrbit's copy")
assert(readAll(temp) == nil and readAll(FIC .. ".bookorbit-old") == nil, "no temp or backup file is left behind")
assert(result.reopened == true, "a book finished before BookOrbit's file changed is reported as reopened")
local sidecar = sidecars[FIC]
assert(sidecar.summary.status == "reading", "the finished book is back to reading")
assert(math.abs(sidecar.percent_finished - 15 / 17) < 1e-9, "the percentage is scaled by the size change")
assert(sidecar.partial_md5_checksum == "bookorbit-copy-v2", "the sidecar's cached hash is the new one")
assert(luasettings_files[baseline_file].files[FIC].size == 17, "fanficupdate's baseline moves to the new size")
assert(state_calls[1][1] == "repair" and state_calls[1][2] == FIC and state_calls[1][3] == "calibre-copy-v1" and state_calls[1][4] == "bookorbit-copy-v2",
    "upstream's state repairs the file identity")
assert(state_calls[2][1] == "link" and state_calls[2][2] == "bookorbit-copy-v2" and state_calls[2][3] == 1 and state_calls[2][4] == 10,
    "upstream's state links the new hash to the file")
assert(account.paths[FIC].hash == "bookorbit-copy-v2", "the fork index has the new hash")

-- A finished book only goes back to reading when BookOrbit's file changed after the day it was finished.
assert(Updates.hasNewContent({ modified = "2026-11-19" }, { contentMtimeMs = NOV_20 }) == true, "changed the day after it was finished")
assert(Updates.hasNewContent({ modified = "2026-11-20" }, { contentMtimeMs = NOV_20 }) == false, "changed the day it was finished counts as already read")
assert(Updates.hasNewContent({ modified = "2026-11-21" }, { contentMtimeMs = NOV_20 }) == false, "finished after the change, as with a copy read over USB")
assert(Updates.hasNewContent({}, { contentMtimeMs = NOV_20 }) == false, "no finish date leaves the book alone")
assert(Updates.hasNewContent({ modified = "2026-11-19" }, {}) == false, "no change time leaves the book alone")

-- The first swap of a Calibre copy the reader finished after its last update keeps it finished.
writeAll(FIC, "calibre-copy-v2b")
account.paths[FIC].hash = "calibre-copy-v2b"
server.files[1].content = "bookorbit-copy-v2c"
sidecars[FIC] = { summary = { status = "complete", modified = "2026-11-21" }, percent_finished = 1.0 }
pending = Updates.find(server.client, account, { 7 })
result = assert(Updates.install(account, pending[1], assert(Updates.download(server.client, pending[1]))))
assert(result.reopened == false, "a same-chapters swap is not reported as reopened")
assert(sidecars[FIC].summary.status == "complete" and sidecars[FIC].percent_finished == 1.0, "the finished book stays finished at 100%")
assert(sidecars[FIC].partial_md5_checksum == "bookorbit-copy-v2c", "the cached hash still moves to the new copy")

-- A book in progress keeps its status; its percentage is scaled (by file size here, as these
-- fake books are not zip files).
writeAll(FIC, "calibre-copy-v3")
account.paths[FIC].hash = "calibre-copy-v3"
server.files[1].content = "bookorbit-copy-v4-longer"
sidecars[FIC] = { summary = { status = "reading" }, percent_finished = 0.5 }
pending = Updates.find(server.client, account, { 7 })
result = assert(Updates.install(account, pending[1], assert(Updates.download(server.client, pending[1]))))
assert(result.reopened == false and sidecars[FIC].summary.status == "reading", "a book in progress keeps its status")
assert(math.abs(sidecars[FIC].percent_finished - 0.5 * 15 / 24) < 1e-9, "its percentage is scaled to the longer copy")

-- A download whose hash does not match is thrown away.
writeAll(FIC, "calibre-copy-v5")
account.paths[FIC].hash = "calibre-copy-v5"
server.corrupt = true
pending = Updates.find(server.client, account, { 7 })
local bad, err = Updates.download(server.client, pending[1])
assert(bad == nil and err == "hash_mismatch", "a mismatched download is refused")
assert(readAll(Updates.tempPath(FIC)) == nil, "the mismatched download is deleted")
assert(readAll(FIC) == "calibre-copy-v5", "the book is untouched")
server.corrupt = nil

-- A failed swap leaves the book in place.
local real_rename = Updates.deps.rename
local temp_ok = assert(Updates.download(server.client, pending[1]))
local renames = 0
Updates.deps.rename = function(from, to)
    renames = renames + 1
    if renames == 2 then return nil, "disk full" end
    return real_rename(from, to)
end
local failed, swap_err = Updates.install(account, pending[1], temp_ok)
Updates.deps.rename = real_rename
assert(failed == nil and swap_err == "disk full", "the swap error is reported")
assert(readAll(FIC) == "calibre-copy-v5", "the original book is restored")
assert(readAll(temp_ok) == nil, "the downloaded copy is removed")

-- Links are released only for copies KOReader never read.
server.requests = {}
read_hashes = { ["read-copy"] = true }
local released = Updates.releaseUnreadLinks(server.client, {
    { oldHash = "unread-copy", bookFileId = 1 },
    { oldHash = "read-copy", bookFileId = 2 },
})
assert(released == 1, "one link is released")
local release = server.requests[1]
assert(release.path == Updates.RELEASE_PATH and #release.body.items == 1 and release.body.items[1].hash == "unread-copy",
    "only the unread copy's link is released")

stats_error = "locked"
server.requests = {}
assert(Updates.releaseUnreadLinks(server.client, { { oldHash = "unread-copy", bookFileId = 1 } }) == 0, "unreadable statistics release nothing")
assert(#server.requests == 0, "no request when statistics cannot be read")

-- Real EPUB zips: the percentage follows the chapter text, not images or the file size.
local function zipOf(entries)
    local parts, directory, offset = {}, {}, 0
    local function u16(n) return string.char(n % 256, math.floor(n / 256) % 256) end
    local function u32(n) return u16(n % 65536) .. u16(math.floor(n / 65536)) end
    for _, entry in ipairs(entries) do
        local name, data = entry[1], entry[2]
        local header = "PK\3\4" .. u16(20) .. u16(0) .. u16(0) .. u32(0) .. u32(0) .. u32(#data) .. u32(#data)
            .. u16(#name) .. u16(0) .. name
        table.insert(parts, header .. data)
        table.insert(directory, "PK\1\2" .. u16(20) .. u16(20) .. u16(0) .. u16(0) .. u32(0) .. u32(0)
            .. u32(#data) .. u32(#data) .. u16(#name) .. u16(0) .. u16(0) .. u16(0) .. u16(0) .. u32(0) .. u32(offset) .. name)
        offset = offset + #header + #data
    end
    local body, central = table.concat(parts), table.concat(directory)
    return body .. central .. "PK\5\6" .. u16(0) .. u16(0) .. u16(#entries) .. u16(#entries)
        .. u32(#central) .. u32(#body) .. u16(0)
end
local Epub = require("bookorbit_fork_epub")
local IMAGE = string.rep("i", 5000)
local OLD_EPUB, NEW_EPUB = ROOT .. "/old.epub", ROOT .. "/new.epub"
writeAll(OLD_EPUB, zipOf({ { "mimetype", "application/epub+zip" }, { "OEBPS/cover.jpg", IMAGE },
    { "OEBPS/file0001.xhtml", string.rep("a", 900) }, { "content.opf", "<package/>" } }))
writeAll(NEW_EPUB, zipOf({ { "mimetype", "application/epub+zip" }, { "OEBPS/cover.jpg", IMAGE },
    { "OEBPS/file0001.xhtml", string.rep("a", 900) }, { "OEBPS/File0002.XHTML", string.rep("b", 100) },
    { "content.opf", "<package version='longer'/>" } }))
assert(Epub.textSize(OLD_EPUB) == 900 and Epub.textSize(NEW_EPUB) == 1000, "only (X)HTML entries are counted")
assert(Epub.textSize(FIC) == nil and Epub.textSize(ROOT .. "/missing.epub") == nil, "a file that is not a zip has no text size")
local ratio = Updates.progressRatio(OLD_EPUB, NEW_EPUB, 1, 1)
assert(math.abs(ratio - 0.9) < 1e-9, "a finished book with one new chapter of ten lands at 90%")
assert(Updates.progressRatio(FIC, ROOT .. "/missing.epub", 10, 20) == 0.5, "without zips the file sizes are used")
assert(Updates.progressRatio(FIC, ROOT .. "/missing.epub", nil, 20) == nil, "without either nothing is estimated")

local ZIPPED = ROOT .. "/Fanfic/Zipped - Author.epub"
writeAll(ZIPPED, readAll(OLD_EPUB))
account.paths[ZIPPED] = { bookFileId = 5, bookId = 50, hash = readAll(OLD_EPUB) }
server.files[5] = { bookId = 50, title = "Zipped", content = readAll(NEW_EPUB), mtimeMs = NOV_20 }
sidecars[ZIPPED] = { summary = { status = "complete", modified = "2026-11-01" }, percent_finished = 1.0 }
pending = Updates.find(server.client, account, { 7 })
local zipped_item
for _, candidate in ipairs(pending) do if candidate.path == ZIPPED then zipped_item = candidate end end
result = assert(Updates.install(account, zipped_item, assert(Updates.download(server.client, zipped_item))))
assert(result.reopened == true and sidecars[ZIPPED].summary.status == "reading", "the finished book with a new chapter is reopened")
assert(math.abs(sidecars[ZIPPED].percent_finished - 0.9) < 1e-9, "100% of the old text is 90% of the new one")

os.execute("rm -rf '" .. ROOT .. "'")
print("bookorbit_fork_updates_test: ok")
