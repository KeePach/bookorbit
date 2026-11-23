-- Fork: the update flow after a manual sync replaces closed books, asks before reloading the open one,
-- and stays silent until libraries are chosen.

package.loaded["logger"] = { dbg = function() end, info = function() end, warn = function() end }
package.loaded["gettext"] = function(text) return text end

local shown, closed = {}, {}
package.loaded["ui/uimanager"] = {
    show = function(_self, widget) table.insert(shown, widget) end,
    close = function(_self, widget) table.insert(closed, widget) end,
    forceRePaint = function() end,
    broadcastEvent = function() end,
    nextTick = function(_self, fn) fn() end,
}
local function widget(kind)
    return { new = function(_self, args) args.kind = kind; return args end }
end
package.loaded["ui/widget/infomessage"] = widget("info")
package.loaded["ui/widget/confirmbox"] = widget("confirm")
package.loaded["ui/event"] = { new = function(_self, name, arg) return { name = name, arg = arg } end }
package.loaded["ui/widget/booklist"] = { resetBookInfoCache = function() end }
package.loaded["apps/filemanager/filemanager"] = {}
local reader = { instance = nil }
package.loaded["apps/reader/readerui"] = reader

local store_data = {}
package.loaded["datastorage"] = { getSettingsDir = function() return "/settings" end }
package.loaded["luasettings"] = {
    open = function(_self, path)
        store_data[path] = store_data[path] or {}
        local data = store_data[path]
        return {
            readSetting = function(_s, key) return data[key] end,
            saveSetting = function(_s, key, value) data[key] = value end,
            flush = function() end,
        }
    end,
}
package.loaded["libs/libkoreader-lfs"] = { dir = function() return function() return nil end end, attributes = function() return nil end }

package.path = "koreader-plugin/bookorbit.koplugin/?.lua;" .. package.path

-- The update logic is replaced; this spec is about the flow around it.
local Updates = require("bookorbit_fork_updates")
local found, installs, downloads, removed, released = {}, {}, {}, {}, {}
Updates.find = function() return found, 0 end
Updates.download = function(_client, item)
    table.insert(downloads, item.path)
    return item.path .. ".part"
end
Updates.install = function(account, item)
    table.insert(installs, item.path)
    account.paths[item.path] = { hash = item.newHash }
    return { reopened = item.finished == true }
end
Updates.releaseUnreadLinks = function(_client, items)
    for _, item in ipairs(items) do table.insert(released, item.path) end
    return #items
end
Updates.deps.remove = function(path) table.insert(removed, path) end

local Store = require("bookorbit_fork_store")
local UI = require("bookorbit_fork_updates_ui")

local client = { server_url = "http://server", username = "reader", request = function() return nil, 404 end }
local plugin = { newClient = function() return client end }

local function reset()
    shown, closed, installs, downloads, removed, released = {}, {}, {}, {}, {}, {}
end

local function lastShown(kind)
    for index = #shown, 1, -1 do
        if shown[index].kind == kind then return shown[index] end
    end
    return nil
end

-- Nothing happens until a library is chosen.
UI.run(plugin)
assert(#shown == 0 and #downloads == 0, "an automatic run without chosen libraries is silent")
UI.run(plugin, { manual = true })
assert(lastShown("info").text:find("Choose the libraries", 1, true), "a manual run explains what is missing")

local store = Store.open(client)
store.account.update_libraries = { 7 }
store.save()

-- Closed books are replaced and summarised.
reset()
found = {
    { path = "/b/Fic.epub", title = "Fic", newHash = "n1", finished = true },
    { path = "/b/Other.epub", title = "", newHash = "n2" },
}
UI.run(plugin)
assert(#installs == 2, "both closed books are replaced")
assert(#released == 2, "their old links are offered for release")
local text = lastShown("info").text
assert(text:find("↻ Fic", 1, true) and text:find("• Other", 1, true), "the summary names each book, by file name when it has no title")
assert(text:find("was finished, now reading", 1, true), "the ↻ marker is explained")
assert(Store.open(client).account.paths["/b/Fic.epub"].hash == "n1", "the store is saved")

-- The open book is downloaded, then the user is asked.
reset()
local reloads = 0
reader.instance = {
    document = { file = "/b/Open.epub" },
    reloadDocument = function(self, after_close)
        reloads = reloads + 1
        after_close(self.document.file)
    end,
}
found = { { path = "/b/Open.epub", title = "Open Fic", newHash = "n3" } }
UI.run(plugin)
local confirm = lastShown("confirm")
assert(confirm and confirm.text:find("Open Fic", 1, true), "the user is asked about the open book")
assert(#downloads == 1 and #installs == 0, "the copy is downloaded first, nothing is replaced yet")
confirm.ok_callback()
assert(reloads == 1 and #installs == 1 and installs[1] == "/b/Open.epub", "accepting replaces the book while the reader reloads it")
assert(released[1] == "/b/Open.epub", "its old link is offered for release")
assert(lastShown("info").text:find("Open Fic", 1, true), "the summary includes the open book")

-- Declining keeps the book and removes the download.
reset()
found = { { path = "/b/Open.epub", title = "Open Fic", newHash = "n4" } }
UI.run(plugin)
lastShown("confirm").cancel_callback()
assert(#installs == 0 and removed[1] == "/b/Open.epub.part", "declining removes the downloaded copy")
assert(lastShown("info") == nil or not lastShown("info").text:find("Updated books", 1, true), "nothing is reported as updated")

-- The menu offers the library choice and a manual check.
local menu = UI.menuItem(plugin)
assert(menu.text == "Fanfic updates" and #menu.sub_item_table == 2, "the menu has two entries")
assert(menu.sub_item_table[1].text_func():find("#7", 1, true), "the chosen library is shown even before its name is known")
local items = menu.sub_item_table[1].sub_item_table_func()
assert(items[1].enabled == false, "a server error shows as a disabled entry")

client.request = function(_self, method, path)
    assert(method == "GET" and path == Updates.LIBRARIES_PATH)
    return { libraries = { { id = 7, name = "Fanfics" }, { id = 8, name = "Webnovels" } } }
end
items = menu.sub_item_table[1].sub_item_table_func()
assert(items[1].text == "Fanfics" and items[1].checked_func() == true, "a chosen library is checked")
assert(items[2].checked_func() == false, "an unchosen library is not")
items[2].callback()
assert(items[2].checked_func() == true, "ticking a library chooses it")
items[1].callback()
local chosen = Store.open(client).account.update_libraries
assert(#chosen == 1 and chosen[1] == 8, "unticking removes it")
assert(menu.sub_item_table[1].text_func():find("Webnovels", 1, true), "the summary uses the library name")

print("bookorbit_fork_updates_ui_test: ok")
