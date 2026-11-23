--[[--
Fork: measures the chapter text in an EPUB without unpacking it.

An EPUB is a zip file whose central directory, at the end of the file, lists every entry with its
uncompressed size. Summing the (X)HTML entries gives the length of the readable text, which grows
with new chapters but not with images, fonts or a changed cover. Only the directory is read.
]]
local Epub = {}

local EOCD_SIGNATURE = "PK\5\6"
local CENTRAL_SIGNATURE = "PK\1\2"
local MAX_TAIL = 22 + 65535

local function u16(data, at)
    local a, b = data:byte(at, at + 1)
    return a + b * 256
end

local function u32(data, at)
    local a, b, c, d = data:byte(at, at + 3)
    return a + b * 256 + c * 65536 + d * 16777216
end

local function isText(name)
    local lower = name:lower()
    return lower:match("%.xhtml$") or lower:match("%.html$") or lower:match("%.htm$")
end

--- Total uncompressed size of the (X)HTML entries in the EPUB at `path`, or nil if it is not a
--- readable zip.
function Epub.textSize(path)
    local file = io.open(path, "rb")
    if not file then return nil end
    local ok, total = pcall(function()
        local size = file:seek("end")
        local tail_size = math.min(size, MAX_TAIL)
        file:seek("set", size - tail_size)
        local tail = file:read(tail_size) or ""
        local eocd
        local search_from = 1
        while true do
            local found = tail:find(EOCD_SIGNATURE, search_from, true)
            if not found then break end
            eocd = found
            search_from = found + 1
        end
        if not eocd or eocd + 21 > #tail then return nil end
        local entries = u16(tail, eocd + 10)
        local directory_size = u32(tail, eocd + 12)
        local directory_offset = u32(tail, eocd + 16)
        if directory_offset + directory_size > size then return nil end

        file:seek("set", directory_offset)
        local directory = file:read(directory_size) or ""
        local at, sum = 1, 0
        for _ = 1, entries do
            if directory:sub(at, at + 3) ~= CENTRAL_SIGNATURE then return nil end
            local uncompressed = u32(directory, at + 24)
            local name_length = u16(directory, at + 28)
            local extra_length = u16(directory, at + 30)
            local comment_length = u16(directory, at + 32)
            local name = directory:sub(at + 46, at + 45 + name_length)
            if isText(name) then sum = sum + uncompressed end
            at = at + 46 + name_length + extra_length + comment_length
        end
        return sum
    end)
    file:close()
    if not ok or not total or total <= 0 then return nil end
    return total
end

return Epub
