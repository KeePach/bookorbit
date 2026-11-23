--[[--
Entry point for this fork's additions to the BookOrbit plugin.

main.lua calls install() once. Fork code wraps upstream functions instead of editing them, so
upstream merges stay conflict free. When a function it expects is gone after a merge, it logs that
and leaves the plugin exactly as upstream wrote it. install() never raises.
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

function Fork.install(_BookOrbit)
    if Fork.installed then return end
    Fork.installed = true
    local ok, err = pcall(wrapMatchCheck)
    if not ok then warn("BookOrbit fork: install failed:", err) end
end

Fork.warn = warn

return Fork
