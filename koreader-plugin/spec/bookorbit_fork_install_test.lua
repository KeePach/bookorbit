-- Fork: install() wraps upstream functions once and leaves each one alone when it cannot.

local warnings = {}
package.loaded["logger"] = {
    dbg = function() end,
    info = function() end,
    warn = function(...) table.insert(warnings, table.concat({ ... }, " ")) end,
}

local calls = {}
package.loaded["bookorbit_fork_link"] = {
    matchCheck = function(original, client, hashes, candidates)
        table.insert(calls, { original = original, client = client, hashes = hashes, candidates = candidates })
        return original(client, hashes, candidates)
    end,
}

local scheduled = {}
package.loaded["ui/uimanager"] = {
    scheduleIn = function(_self, _delay, fn) table.insert(scheduled, fn) end,
}
local runs = {}
local menu_entry = { text = "Fanfic updates" }
package.loaded["bookorbit_fork_updates_ui"] = {
    run = function(plugin) table.insert(runs, plugin) end,
    menuItem = function() return menu_entry end,
}

package.path = "koreader-plugin/bookorbit.koplugin/?.lua;" .. package.path

local function freshFork(api)
    package.loaded["bookorbit_api"] = api
    package.loaded["bookorbit_fork"] = nil
    return require("bookorbit_fork")
end

local function hasWarning(text)
    for _, warning in ipairs(warnings) do
        if warning:find(text, 1, true) then return true end
    end
    return false
end

-- The match check is wrapped once.
local upstream = function(_client, hashes) return { matches = {}, hashes = hashes } end
local api = { matchCheck = upstream }
local sweeps = {}
local BookOrbit = {
    requestSweep = function(self, interactive, source, opts)
        table.insert(sweeps, { self = self, interactive = interactive, source = source, opts = opts })
    end,
    addToMainMenu = function(_self, menu_items)
        menu_items.bookorbit = { text = "BookOrbit", sub_item_table = { { id = "settings" } } }
    end,
    isLoggedIn = function() return true end,
}
local Fork = freshFork(api)
Fork.install(BookOrbit)
assert(api.matchCheck ~= upstream, "the match check is wrapped")
local client = {}
local body = api.matchCheck(client, { "h" }, { h = {} })
assert(#calls == 1 and calls[1].original == upstream and calls[1].client == client, "the wrapper hands the upstream function to the fork")
assert(body.hashes[1] == "h", "the upstream result comes back")

local wrapped = api.matchCheck
Fork.install(BookOrbit)
assert(api.matchCheck == wrapped, "a second install does not wrap twice")

-- A Sync now started by the user runs the update flow after it finishes without an error.
local plugin = setmetatable({}, { __index = BookOrbit })
local user_done = {}
plugin:requestSweep(true, "manual", { on_done = function(err) table.insert(user_done, err or "ok") end, quiet = true })
local sweep = sweeps[#sweeps]
assert(sweep.interactive == true and sweep.source == "manual" and sweep.opts.quiet == true, "the sweep gets its own arguments")
sweep.opts.on_done(nil)
assert(user_done[1] == "ok", "the caller's on_done still runs")
assert(#scheduled == 1, "the update flow is scheduled after a successful sync")
scheduled[1]()
assert(runs[1] == plugin, "the update flow runs for the plugin that synced")

sweep.opts.on_done("network")
assert(user_done[2] == "network", "errors still reach the caller")
assert(#scheduled == 1, "a failed sync does not check for updates")

plugin:requestSweep(false, "auto", nil)
assert(sweeps[#sweeps].opts == nil, "an automatic sync is passed through untouched")

-- The menu entry goes into BookOrbit's own menu.
local menu_items = {}
plugin:addToMainMenu(menu_items)
local sub = menu_items.bookorbit.sub_item_table
assert(sub[#sub] == menu_entry, "Fanfic updates is added under BookOrbit")

-- Missing upstream functions are logged and skipped, never raised.
local bare = {}
Fork = freshFork(bare)
Fork.install({})
assert(bare.matchCheck == nil, "nothing is added when upstream renamed the function")
assert(hasWarning("matchCheck not found"), "the missing match check is logged")
assert(hasWarning("requestSweep not found"), "the missing sweep is logged")
assert(hasWarning("addToMainMenu not found"), "the missing menu is logged")

local source = assert(io.open("koreader-plugin/bookorbit.koplugin/main.lua", "rb")):read("*a")
assert(source:find('local fork_ok, Fork = pcall(require, "bookorbit_fork") if fork_ok then Fork.install(BookOrbit) end', 1, true),
    "main.lua installs the fork with its single guarded line")

print("bookorbit_fork_install_test: ok")
