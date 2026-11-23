--[[--
Entry point for this fork's additions to the BookOrbit plugin.

main.lua calls install() once. Fork code wraps upstream functions instead of editing them, so
upstream merges stay conflict free. When a function it expects is gone after a merge, it logs that
and leaves that part of the plugin exactly as upstream wrote it. install() never raises.

  matchCheck      relinks books whose file changed (bookorbit_fork_link)
  requestSweep    after a Sync now started by the user, updates books over Wi-Fi
  addToMainMenu   adds BookOrbit > Fanfic updates
]]
local Fork = { installed = false }

local function warn(...)
    local ok, logger = pcall(require, "logger")
    if ok and type(logger) == "table" and type(logger.warn) == "function" then pcall(logger.warn, ...) end
end

local function wrapMatchCheck()
    local Api = require("bookorbit_api")
    if type(Api) ~= "table" or type(Api.matchCheck) ~= "function" then
        warn("BookOrbit fork: BookOrbitApi.matchCheck not found, change linking disabled")
        return
    end
    local Link = require("bookorbit_fork_link")
    local original = Api.matchCheck
    Api.matchCheck = function(client, hashes, candidates)
        return Link.matchCheck(original, client, hashes, candidates)
    end
end

local function runUpdates(plugin)
    local ok, UIManager = pcall(require, "ui/uimanager")
    if not ok then return end
    UIManager:scheduleIn(1, function()
        local run_ok, err = pcall(function() require("bookorbit_fork_updates_ui").run(plugin) end)
        if not run_ok then warn("BookOrbit fork: book update run failed:", err) end
    end)
end

local function wrapRequestSweep(BookOrbit)
    if type(BookOrbit.requestSweep) ~= "function" then
        warn("BookOrbit fork: BookOrbit.requestSweep not found, Wi-Fi updates disabled")
        return
    end
    local original = BookOrbit.requestSweep
    BookOrbit.requestSweep = function(self, interactive, source, opts)
        if not interactive then return original(self, interactive, source, opts) end
        local wrapped = {}
        for key, value in pairs(opts or {}) do wrapped[key] = value end
        local on_done = wrapped.on_done
        wrapped.on_done = function(err)
            if on_done then pcall(on_done, err) end
            if not err then runUpdates(self) end
        end
        return original(self, interactive, source, wrapped)
    end
end

local function wrapMainMenu(BookOrbit)
    if type(BookOrbit.addToMainMenu) ~= "function" then
        warn("BookOrbit fork: BookOrbit.addToMainMenu not found, Fanfic updates menu disabled")
        return
    end
    local original = BookOrbit.addToMainMenu
    BookOrbit.addToMainMenu = function(self, menu_items)
        local result = original(self, menu_items)
        local ok, err = pcall(function()
            if type(self.isLoggedIn) == "function" and not self:isLoggedIn() then return end
            local entry = require("bookorbit_fork_updates_ui").menuItem(self)
            local bookorbit = menu_items.bookorbit
            if type(bookorbit) == "table" and type(bookorbit.sub_item_table) == "table" then
                table.insert(bookorbit.sub_item_table, entry)
            else
                entry.sorting_hint = "tools"
                menu_items.bookorbit_fork_updates = entry
            end
        end)
        if not ok then warn("BookOrbit fork: menu entry not added:", err) end
        return result
    end
end

function Fork.install(BookOrbit)
    if Fork.installed then return end
    Fork.installed = true
    for _, step in ipairs({ wrapMatchCheck, wrapRequestSweep, wrapMainMenu }) do
        local ok, err = pcall(step, BookOrbit)
        if not ok then warn("BookOrbit fork: install step failed:", err) end
    end
end

Fork.warn = warn

return Fork
