--[[--
Fork: this fork's own settings file, one section per BookOrbit server and user.

  paths              device path -> { bookFileId, bookId, hash } of the book last matched there
  update_libraries   ids of the libraries whose books are kept up to date over Wi-Fi
  library_names      id -> name, for showing the choice without a request

Upstream's sync state is only ever read, never written, from here.
]]
local DataStorage = require("datastorage")
local LuaSettings = require("luasettings")
local lfs = require("libs/libkoreader-lfs")

local Store = {}

Store.FILE = "bookorbit_fork_state.lua"

local function settingsDir()
    return DataStorage:getSettingsDir()
end

function Store.accountKey(client)
    return tostring(client.server_url or "") .. "|" .. tostring(client.username or "")
end

-- Upstream's sync state already knows the path and file id of every matched book; reading it once
-- lets books that changed before this fork code was installed relink by path too.
local function seedFromUpstreamState()
    local paths = {}
    local dir = settingsDir()
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

--- Opens the file fresh each time, so a sync running in another process never writes over it.
--- Returns a handle with `.account` and `:save()`.
function Store.open(client)
    local settings = LuaSettings:open(settingsDir() .. "/" .. Store.FILE)
    local accounts = settings:readSetting("accounts") or {}
    local key = Store.accountKey(client)
    local account = accounts[key]
    local seeded = false
    if type(account) ~= "table" then
        account = { paths = seedFromUpstreamState() }
        accounts[key] = account
        seeded = true
    end
    account.paths = account.paths or {}
    account.update_libraries = account.update_libraries or {}
    account.library_names = account.library_names or {}

    local handle = { account = account }
    function handle.save()
        settings:saveSetting("accounts", accounts)
        settings:flush()
    end
    if seeded then handle.save() end
    return handle
end

return Store
