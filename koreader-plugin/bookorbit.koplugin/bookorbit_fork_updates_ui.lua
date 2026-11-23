--[[--
Fork: the Wi-Fi update flow around bookorbit_fork_updates, and its menu.

Runs after a manual Sync now finishes. Closed books are replaced right away; for the book that is
open the user is asked first, and the reader reloads it after the swap. Nothing runs until at least
one library is chosen under BookOrbit > Fanfic updates.
]]
local Store = require("bookorbit_fork_store")
local Updates = require("bookorbit_fork_updates")

local UI = {}

local function log(level, ...)
    local ok, logger = pcall(require, "logger")
    if ok and type(logger) == "table" and type(logger[level]) == "function" then pcall(logger[level], ...) end
end

local function gettext(text)
    local ok, _ = pcall(require, "gettext")
    return ok and type(_) == "function" and _(text) or text
end

local function show(widget)
    local UIManager = require("ui/uimanager")
    UIManager:show(widget)
    UIManager:forceRePaint()
    return widget
end

local function close(widget)
    if widget then require("ui/uimanager"):close(widget) end
end

local function progress(text, previous)
    close(previous)
    local InfoMessage = require("ui/widget/infomessage")
    return show(InfoMessage:new{ text = text, dismissable = false })
end

local function currentReader()
    local ok, ReaderUI = pcall(require, "apps/reader/readerui")
    local ui = ok and ReaderUI and ReaderUI.instance
    if ui and ui.document and type(ui.document.file) == "string" then return ui end
    return nil
end

local function titleOf(item)
    if type(item.title) == "string" and item.title ~= "" then return item.title end
    return (item.path:match("([^/]+)%.[^./]+$")) or item.path
end

local function refreshLibraryViews(paths)
    pcall(function()
        local UIManager = require("ui/uimanager")
        local Event = require("ui/event")
        for _, path in ipairs(paths) do
            pcall(function() require("ui/widget/booklist").resetBookInfoCache(path) end)
            UIManager:broadcastEvent(Event:new("InvalidateMetadataCache", path))
            UIManager:broadcastEvent(Event:new("BookMetadataChanged", { filepath = path }))
        end
        local FileManager = require("apps/filemanager/filemanager")
        if FileManager.instance then FileManager.instance:onRefresh() end
    end)
end

local function summary(lines, failures)
    local text = gettext("Updated books:") .. "\n" .. table.concat(lines, "\n")
    if failures > 0 then
        text = text .. "\n\n" .. string.format(gettext("%d could not be updated, see crash.log."), failures)
    end
    if text:find("↻", 1, true) then text = text .. "\n\n" .. gettext("↻ = was finished, now reading") end
    return text
end

local function askAboutOpenBook(plugin, item, temp, on_done)
    local ConfirmBox = require("ui/widget/confirmbox")
    show(ConfirmBox:new{
        text = string.format(gettext("\"%s\" has an update in BookOrbit.\n\nUpdate now and reload it?"), titleOf(item)),
        ok_text = gettext("Update"),
        cancel_text = gettext("Later"),
        ok_callback = function()
            local ui = currentReader()
            if not ui or ui.document.file ~= item.path or type(ui.reloadDocument) ~= "function" then
                Updates.deps.remove(temp)
                on_done(nil)
                return
            end
            local result
            ui:reloadDocument(function()
                local store = Store.open(plugin:newClient())
                local installed, err = Updates.install(store.account, item, temp)
                if installed then
                    store.save()
                    result = installed
                else
                    log("warn", "BookOrbit fork: could not update open book:", err)
                end
            end)
            on_done(result)
        end,
        cancel_callback = function()
            Updates.deps.remove(temp)
            on_done(nil)
        end,
    })
end

function UI.run(plugin, opts)
    opts = opts or {}
    local client = plugin:newClient()
    local store = Store.open(client)
    local libraries = store.account.update_libraries
    if #libraries == 0 then
        if opts.manual then
            show(require("ui/widget/infomessage"):new{ text = gettext("Choose the libraries to keep updated first.") })
        end
        return
    end

    local message = progress(gettext("Checking BookOrbit for book updates…"))
    local pending, current_or_err = Updates.find(client, store.account, libraries)
    store.save()
    if not pending then
        close(message)
        log("warn", "BookOrbit fork: update check failed:", current_or_err)
        if opts.manual then
            show(require("ui/widget/infomessage"):new{ text = gettext("Could not check for book updates.") })
        end
        return
    end
    if #pending == 0 then
        close(message)
        if opts.manual then show(require("ui/widget/infomessage"):new{ text = gettext("All books are up to date."), timeout = 3 }) end
        return
    end

    local reader = currentReader()
    local open_path = reader and reader.document.file
    local lines, installed, changed_paths, failures, open_item = {}, {}, {}, 0, nil
    for index, item in ipairs(pending) do
        if item.path == open_path then
            open_item = item
        else
            message = progress(string.format(gettext("Updating books from BookOrbit (%d/%d)…"), index, #pending), message)
            local temp, err = Updates.download(client, item)
            local result
            if temp then result, err = Updates.install(store.account, item, temp) end
            if result then
                table.insert(installed, item)
                table.insert(changed_paths, item.path)
                table.insert(lines, (result.reopened and "↻ " or "• ") .. titleOf(item))
            else
                failures = failures + 1
                log("warn", "BookOrbit fork: could not update", item.path, err)
            end
        end
    end
    store.save()

    local released = Updates.releaseUnreadLinks(client, installed)
    log("info", "BookOrbit fork: updated", #installed, "books, failed", failures, "released links", released)
    close(message)
    refreshLibraryViews(changed_paths)

    local function finish(open_result)
        if open_result then
            table.insert(installed, open_item)
            table.insert(lines, (open_result.reopened and "↻ " or "• ") .. titleOf(open_item))
            Updates.releaseUnreadLinks(client, { open_item })
        end
        if #lines > 0 or failures > 0 then
            show(require("ui/widget/infomessage"):new{ text = summary(lines, failures) })
        end
    end

    if not open_item then
        finish(nil)
        return
    end
    local temp, err = Updates.download(client, open_item)
    if not temp then
        failures = failures + 1
        log("warn", "BookOrbit fork: could not download update for open book:", err)
        finish(nil)
        return
    end
    askAboutOpenBook(plugin, open_item, temp, finish)
end

-- ---------------------------------------------------------------- menu

local function setChosen(client, id, wanted)
    local store = Store.open(client)
    local ids = {}
    for _, existing in ipairs(store.account.update_libraries) do
        if existing ~= id then table.insert(ids, existing) end
    end
    if wanted then table.insert(ids, id) end
    table.sort(ids)
    store.account.update_libraries = ids
    store.save()
end

--- The library checkboxes, fetched from the server each time the submenu opens.
function UI.libraryItems(plugin)
    local client = plugin:newClient()
    local body, err = client:request("GET", Updates.LIBRARIES_PATH)
    if type(body) ~= "table" or type(body.libraries) ~= "table" then
        return {
            { text = gettext("Could not load the libraries from BookOrbit.") .. " " .. tostring(err or ""), enabled = false },
        }
    end
    local store = Store.open(client)
    for _, library in ipairs(body.libraries) do
        store.account.library_names[tostring(library.id)] = library.name
    end
    store.save()

    local items = {}
    for _, library in ipairs(body.libraries) do
        local id = library.id
        table.insert(items, {
            text = library.name,
            keep_menu_open = true,
            checked_func = function()
                for _, chosen in ipairs(Store.open(client).account.update_libraries) do
                    if chosen == id then return true end
                end
                return false
            end,
            callback = function(touchmenu_instance)
                local chosen = false
                for _, existing in ipairs(Store.open(client).account.update_libraries) do
                    if existing == id then chosen = true end
                end
                setChosen(client, id, not chosen)
                if touchmenu_instance then touchmenu_instance:updateItems() end
            end,
        })
    end
    return items
end

local function chosenSummary(plugin)
    local ok, store = pcall(Store.open, plugin:newClient())
    if not ok then return "" end
    local names = {}
    for _, id in ipairs(store.account.update_libraries) do
        table.insert(names, store.account.library_names[tostring(id)] or ("#" .. tostring(id)))
    end
    return #names > 0 and table.concat(names, ", ") or gettext("none")
end

function UI.menuItem(plugin)
    return {
        text = gettext("Fanfic updates"),
        sub_item_table = {
            {
                text_func = function() return gettext("Libraries to keep updated: ") .. chosenSummary(plugin) end,
                sub_item_table_func = function() return UI.libraryItems(plugin) end,
            },
            {
                text = gettext("Check for updates now"),
                callback = function()
                    require("ui/uimanager"):nextTick(function()
                        local ok, err = pcall(UI.run, plugin, { manual = true })
                        if not ok then log("warn", "BookOrbit fork: update run failed:", err) end
                    end)
                end,
            },
        },
    }
end

return UI
