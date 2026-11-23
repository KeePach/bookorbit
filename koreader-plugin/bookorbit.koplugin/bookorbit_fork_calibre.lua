--[[--
Fork: finds the Calibre uuid of a book on this device.

Calibre's "Connect to folder" and USB drivers keep a JSON list of the books they sent
(`.metadata.calibre` or `metadata.calibre`) at the root of the folder they manage. Each entry has
the book's path relative to that root (`lpath`) and its Calibre `uuid`, which BookOrbit also reads
from the library's metadata.opf. A copy Calibre sent also carries the uuid inside the EPUB as a
`calibre:` identifier, used when the JSON file is missing.
]]
local lfs = require("libs/libkoreader-lfs")

local Calibre = {}

local function log(level, ...)
    local ok, logger = pcall(require, "logger")
    if ok and type(logger) == "table" and type(logger[level]) == "function" then pcall(logger[level], ...) end
end

local METADATA_FILES = { ".metadata.calibre", "metadata.calibre" }
local MAX_PLAIN_PARSE_BYTES = 40 * 1024 * 1024
local UUID_PATTERN = "^%x%x%x%x%x%x%x%x%-%x%x%x%x%-%x%x%x%x%-%x%x%x%x%-%x%x%x%x%x%x%x%x%x%x%x%x$"

-- dir -> metadata file path, or false when no ancestor has one.
local root_by_dir = {}
-- metadata file path -> { mtime, size, uuids = { [lpath] = uuid } }
local cache = {}

local function normalize(path)
    return (path:gsub("//+", "/"))
end

function Calibre.isUuid(value)
    return type(value) == "string" and value:match(UUID_PATTERN) ~= nil
end

local function findMetadataFile(dir)
    local seen = {}
    local current = dir
    while current and current ~= "" do
        local known = root_by_dir[current]
        if known ~= nil then
            for _, d in ipairs(seen) do root_by_dir[d] = known end
            return known or nil
        end
        table.insert(seen, current)
        for _, name in ipairs(METADATA_FILES) do
            local candidate = current .. "/" .. name
            if lfs.attributes(candidate, "mode") == "file" then
                for _, d in ipairs(seen) do root_by_dir[d] = candidate end
                return candidate
            end
        end
        local parent = current:match("^(.+)/[^/]+$")
        if not parent or parent == current then break end
        current = parent
    end
    for _, d in ipairs(seen) do root_by_dir[d] = false end
    return nil
end

local function decode(path, size)
    local ok_require, rapidjson = pcall(require, "rapidjson")
    if not ok_require then return nil end
    -- KOReader's slim parser keeps only the fields its own calibre plugin needs, uuid and lpath among them.
    if type(rapidjson.load_calibre) == "function" then
        local ok, data = pcall(rapidjson.load_calibre, path)
        if ok and type(data) == "table" then return data end
    end
    if size > MAX_PLAIN_PARSE_BYTES or type(rapidjson.load) ~= "function" then return nil end
    local ok, data = pcall(rapidjson.load, path)
    if ok and type(data) == "table" then return data end
    return nil
end

local function load(metadata_path)
    local attr = lfs.attributes(metadata_path)
    if not attr then return nil end
    local entry = cache[metadata_path]
    if entry and entry.mtime == attr.modification and entry.size == attr.size then return entry end
    local data = decode(metadata_path, attr.size or 0)
    local uuids = {}
    for _, book in ipairs(data or {}) do
        if type(book) == "table" and type(book.lpath) == "string" and Calibre.isUuid(book.uuid) then
            uuids[normalize(book.lpath)] = book.uuid:lower()
        end
    end
    if not data then log("warn", "BookOrbit fork: could not read", metadata_path) end
    entry = { mtime = attr.modification, size = attr.size, uuids = uuids }
    cache[metadata_path] = entry
    return entry
end

--- The Calibre uuid recorded for the book at `path`, or nil.
function Calibre.uuidForPath(path)
    if type(path) ~= "string" or path == "" then return nil end
    path = normalize(path)
    local dir = path:match("^(.+)/[^/]+$")
    if not dir then return nil end
    local metadata_path = findMetadataFile(dir)
    if not metadata_path then return nil end
    local root = metadata_path:match("^(.+)/[^/]+$")
    local entry = load(metadata_path)
    if not entry or path:sub(1, #root + 1) ~= root .. "/" then return nil end
    return entry.uuids[path:sub(#root + 2)]
end

--- The Calibre uuid among KOReader's newline-separated `scheme:value` identifiers, or nil.
function Calibre.uuidFromIdentifiers(identifiers)
    if type(identifiers) ~= "string" then return nil end
    for line in identifiers:gmatch("[^\r\n]+") do
        local value = line:match("^%s*[Cc][Aa][Ll][Ii][Bb][Rr][Ee]:%s*(%S+)%s*$")
        if Calibre.isUuid(value) then return value:lower() end
    end
    return nil
end

--- Forgets folders that had no metadata file, so one Calibre writes later is found.
function Calibre.forgetMisses()
    for dir, known in pairs(root_by_dir) do
        if known == false then root_by_dir[dir] = nil end
    end
end

function Calibre.resetCache()
    root_by_dir = {}
    cache = {}
end

return Calibre
