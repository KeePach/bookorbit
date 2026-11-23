-- Fork: install() wraps the match check once and leaves the plugin alone when it cannot.

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

package.path = "koreader-plugin/bookorbit.koplugin/?.lua;" .. package.path

local function freshFork(api)
    package.loaded["bookorbit_api"] = api
    package.loaded["bookorbit_fork"] = nil
    return require("bookorbit_fork")
end

local upstream = function(_client, hashes) return { matches = {}, hashes = hashes } end
local api = { matchCheck = upstream }
local Fork = freshFork(api)
Fork.install({})
assert(api.matchCheck ~= upstream, "the match check is wrapped")
local client = {}
local body = api.matchCheck(client, { "h" }, { h = {} })
assert(#calls == 1 and calls[1].original == upstream and calls[1].client == client, "the wrapper hands the upstream function to the fork")
assert(body.hashes[1] == "h", "the upstream result comes back")

local wrapped = api.matchCheck
Fork.install({})
assert(api.matchCheck == wrapped, "a second install does not wrap twice")

local bare = {}
Fork = freshFork(bare)
Fork.install({})
assert(bare.matchCheck == nil, "nothing is added when upstream renamed the function")
assert(warnings[#warnings]:find("matchCheck not found", 1, true), "the missing function is logged")

local source = assert(io.open("koreader-plugin/bookorbit.koplugin/main.lua", "rb")):read("*a")
assert(source:find('local fork_ok, Fork = pcall(require, "bookorbit_fork") if fork_ok then Fork.install(BookOrbit) end', 1, true),
    "main.lua installs the fork with its single guarded line")

print("bookorbit_fork_install_test: ok")
