--[[--
Fork: replaces books on this device with BookOrbit's current copy.

For every book the fork has matched at a device path, the server is asked whether its file in one
of the chosen libraries changed. A changed file is downloaded next to the book under a hidden name,
checked against the hash the server announced, and swapped in at the same path. Keeping the path
keeps KOReader's sidecar (position, highlights), calibre's .metadata.calibre entry and the
collections built from it. The new copy is byte for byte BookOrbit's file, so it matches by hash
and needs no link.

Everything KOReader-specific goes through Updates.deps, which the specs replace.
]]
local Updates = {}

Updates.CHECK_PATH = "/koreader/plugin/fork/file-updates"
Updates.LIBRARIES_PATH = "/koreader/plugin/fork/libraries"
Updates.RELEASE_PATH = "/koreader/plugin/fork/release-links"
local CHECK_BATCH = 500

function Updates.downloadPath(book_file_id)
    return "/koreader/plugin/fork/files/" .. tostring(book_file_id) .. "/original"
end

local function log(level, ...)
    local ok, logger = pcall(require, "logger")
    if ok and type(logger) == "table" and type(logger[level]) == "function" then pcall(logger[level], ...) end
end

local function lazy(name)
    return function() return require(name) end
end

Updates.deps = {
    lfs = lazy("libs/libkoreader-lfs"),
    util = lazy("util"),
    DocSettings = lazy("docsettings"),
    DataStorage = lazy("datastorage"),
    LuaSettings = lazy("luasettings"),
    rename = function(from, to) return os.rename(from, to) end,
    remove = function(path) return os.remove(path) end,
}

local function dep(name)
    local value = Updates.deps[name]
    if type(value) == "function" and name ~= "rename" and name ~= "remove" then return value() end
    return value
end

local function exists(path)
    return dep("lfs").attributes(path, "mode") == "file"
end

local function partialMD5(path)
    local ok, digest = pcall(dep("util").partialMD5, path)
    return ok and digest or nil
end

local function splitPath(path)
    local dir, name = path:match("^(.*)/([^/]+)$")
    return dir or ".", name or path
end

--- Hidden download target next to the book, so the swap is a rename on the same partition.
function Updates.tempPath(path)
    local dir, name = splitPath(path)
    return dir .. "/." .. name .. ".bookorbit-part"
end

--- Asks the server about every book the fork knows on this device. Returns the books whose file
--- changed (with the device's current hash) and the number that were already current.
function Updates.find(client, account, library_ids)
    local entries = {}
    for path, known in pairs(account.paths or {}) do
        if type(known) == "table" and known.bookFileId and known.hash and exists(path) then
            table.insert(entries, { path = path, bookFileId = known.bookFileId, bookId = known.bookId, hash = known.hash })
        end
    end
    table.sort(entries, function(a, b) return a.path < b.path end)

    local pending, current = {}, 0
    for offset = 1, #entries, CHECK_BATCH do
        local batch = { unpack(entries, offset, math.min(offset + CHECK_BATCH - 1, #entries)) }
        local items = {}
        for _, entry in ipairs(batch) do table.insert(items, { bookFileId = entry.bookFileId, hash = entry.hash }) end
        local body, err = client:request("POST", Updates.CHECK_PATH, { libraryIds = library_ids, items = items })
        if type(body) ~= "table" or type(body.items) ~= "table" then return nil, err or "bad_response" end
        for index, result in ipairs(body.items) do
            local entry = batch[index]
            if entry and type(result) == "table" and result.bookFileId == entry.bookFileId then
                if result.status == "current" then
                    current = current + 1
                elseif result.status == "updated" and result.fileHash then
                    local on_disk = partialMD5(entry.path)
                    if on_disk == result.fileHash then
                        account.paths[entry.path].hash = on_disk
                        current = current + 1
                    elseif on_disk then
                        table.insert(pending, {
                            path = entry.path,
                            bookFileId = entry.bookFileId,
                            bookId = result.bookId or entry.bookId,
                            title = result.title,
                            oldHash = on_disk,
                            newHash = result.fileHash,
                            sizeBytes = result.sizeBytes,
                            contentMtimeMs = tonumber(result.mtimeMs),
                        })
                    end
                end
            end
        end
    end
    return pending, current
end

--- Downloads the new copy to the hidden temp path and checks its hash. Returns the temp path.
function Updates.download(client, item)
    local temp = Updates.tempPath(item.path)
    dep("remove")(temp)
    local result, err = client:downloadBlocking(Updates.downloadPath(item.bookFileId), temp, {
        temp_path = temp,
        publish = "parent",
        hash = "partial_md5",
        expected_bytes = tonumber(item.sizeBytes),
    })
    if type(result) ~= "table" then return nil, err or "download_failed" end
    local digest = result.hash or partialMD5(temp)
    if digest ~= item.newHash then
        dep("remove")(temp)
        return nil, "hash_mismatch"
    end
    return temp
end

local function swap(path, temp)
    local backup = path .. ".bookorbit-old"
    dep("remove")(backup)
    local moved, move_err = dep("rename")(path, backup)
    if not moved then return nil, move_err or "rename_failed" end
    local placed, place_err = dep("rename")(temp, path)
    if not placed then
        dep("rename")(backup, path)
        return nil, place_err or "rename_failed"
    end
    dep("remove")(backup)
    return true
end

-- Whether the incoming copy holds chapters the current one lacks. FanFicFare adds chapters, so the
-- incoming copy has more chapter text; the first swap of a Calibre copy, or a copy already finished
-- over USB, has the same. Without zips to measure, BookOrbit's change date is compared with the day
-- the status was set (`summary.modified`), and without those dates nothing is assumed.
function Updates.hasNewContent(old_text, new_text, summary, content_mtime_ms)
    if old_text and new_text then return new_text > old_text end
    local finished_on = type(summary.modified) == "string" and summary.modified:match("^(%d%d%d%d%-%d%d%-%d%d)") or nil
    local changed_ms = tonumber(content_mtime_ms)
    if not finished_on or not changed_ms then return false end
    return os.date("%Y-%m-%d", math.floor(changed_ms / 1000)) > finished_on
end

-- How far through the new copy the old position sits. The position itself is a pointer into a
-- chapter that new chapters do not move, so KOReader reopens on the same sentence and sets the exact
-- percentage then; until it is opened, the old percentage scaled by the change in chapter text is
-- close. File sizes are only the fallback, since images and fonts swamp them.
function Updates.measure(old_path, new_path, old_size, new_size)
    local Epub = require("bookorbit_fork_epub")
    local old_text, new_text = Epub.textSize(old_path), Epub.textSize(new_path)
    local ratio
    if old_text and new_text then
        ratio = old_text / new_text
    elseif old_size and old_size > 0 and new_size and new_size > 0 then
        ratio = old_size / new_size
    end
    return { oldText = old_text, newText = new_text, ratio = ratio }
end

--- Brings KOReader's sidecar for the book at `path` in line with a new copy of its file.
--- A finished book with new chapters goes back to reading below 100%. With `scale_in_progress`, a
--- book in progress keeps its status and has its percentage scaled. Returns true when a finished
--- book was reopened.
function Updates.applyToSidecar(path, change)
    local DocSettings = dep("DocSettings")
    if not DocSettings:hasSidecarFile(path) then return false end
    local settings = DocSettings:open(path)
    local reopened = false
    local summary = settings:readSetting("summary") or {}
    local percent = tonumber(settings:readSetting("percent_finished"))
    local ratio = change.measure and change.measure.ratio
    if summary.status == "complete" then
        local measure = change.measure or {}
        if Updates.hasNewContent(measure.oldText, measure.newText, summary, change.contentMtimeMs) then
            summary.status = "reading"
            summary.modified = os.date("%Y-%m-%d")
            settings:saveSetting("summary", summary)
            if percent and ratio then settings:saveSetting("percent_finished", math.min(percent * ratio, 0.99)) end
            reopened = true
        end
    elseif change.scaleInProgress and percent and ratio and ratio ~= 1 then
        settings:saveSetting("percent_finished", math.min(percent * ratio, 1))
    end
    if change.newHash then settings:saveSetting("partial_md5_checksum", change.newHash) end
    settings:flush()
    return reopened
end

--- The fanficupdate plugin compares sizes against its own baseline; moving the baseline keeps it from
--- treating a change the fork already handled as a second update and scaling the percentage again.
function Updates.moveFanficBaseline(path)
    local ok = pcall(function()
        local file = dep("DataStorage"):getSettingsDir() .. "/fanficupdate.lua"
        if not exists(file) then return end
        local attributes = dep("lfs").attributes(path) or {}
        local db = dep("LuaSettings"):open(file)
        local files = db:readSetting("files")
        if type(files) == "table" and files[path] then
            files[path] = { size = attributes.size, mtime = attributes.modification }
            db:saveSetting("files", files)
            db:flush()
        end
    end)
    if not ok then log("warn", "BookOrbit fork: fanficupdate baseline not updated for", path) end
end

local function tellUpstreamState(item)
    local ok, StateManager = pcall(require, "bookorbit_state_manager")
    if not ok or type(StateManager) ~= "table" then return end
    if type(StateManager.repairFileIdentity) == "function" then
        pcall(StateManager.repairFileIdentity, item.path, item.oldHash, item.newHash)
    end
    if type(StateManager.linkFile) == "function" then
        pcall(StateManager.linkFile, item.newHash, item.bookFileId, item.bookId, item.path)
    end
end

--- Swaps the downloaded copy in and brings every record of the book up to date.
--- Returns { reopened = bool } or nil plus an error.
function Updates.install(account, item, temp)
    local lfs = dep("lfs")
    local old_attributes = lfs.attributes(item.path) or {}
    local temp_attributes = lfs.attributes(temp) or {}
    local measure_ok, measure = pcall(Updates.measure, item.path, temp, old_attributes.size, temp_attributes.size)
    if not measure_ok then measure = {} end
    local ok, err = swap(item.path, temp)
    if not ok then
        dep("remove")(temp)
        return nil, err
    end

    local reopened = false
    local sidecar_ok, sidecar_result = pcall(Updates.applyToSidecar, item.path, {
        measure = measure,
        contentMtimeMs = item.contentMtimeMs,
        newHash = item.newHash,
        scaleInProgress = true,
    })
    if sidecar_ok then reopened = sidecar_result else log("warn", "BookOrbit fork: sidecar not updated:", sidecar_result) end
    Updates.moveFanficBaseline(item.path)
    tellUpstreamState(item)

    account.paths[item.path] = { bookFileId = item.bookFileId, bookId = item.bookId, hash = item.newHash, textSize = measure.newText or 0 }
    return { reopened = reopened }
end

local function wasRead(session, hash)
    local result, err = session:select("SELECT id FROM book WHERE md5 = ? LIMIT 1", { hash })
    if err then return true end
    return result ~= nil
end

--- Releases the links the replaced copies needed, but only for copies KOReader never read: a read
--- copy's link is what keeps its reading time attached to the book.
function Updates.releaseUnreadLinks(client, installed)
    if #installed == 0 then return 0 end
    local ok, StatsReader = pcall(require, "bookorbit_stats_reader")
    if not ok or type(StatsReader) ~= "table" or type(StatsReader.openSession) ~= "function" then return 0 end
    local session = StatsReader.openSession()
    if not session then return 0 end
    local items = {}
    local read_ok, read_err = pcall(function()
        for _, item in ipairs(installed) do
            if not wasRead(session, item.oldHash) then
                table.insert(items, { hash = item.oldHash, bookFileId = item.bookFileId })
            end
        end
    end)
    pcall(session.close, session)
    if not read_ok then
        log("warn", "BookOrbit fork: could not read statistics:", read_err)
        return 0
    end
    if #items == 0 then return 0 end
    local body = client:request("POST", Updates.RELEASE_PATH, { items = items })
    return type(body) == "table" and tonumber(body.released) or 0
end

return Updates
