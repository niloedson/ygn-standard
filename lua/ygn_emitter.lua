--[[
  YGN (Yu-Gi-Oh! Game Notation) Event Emitter for Lua / ocgcore
  Compatible with EDOPro, Project Ignis, and YGO Omega core scripting.
  Part of YGN-Standard RFC 0001
--]]

local YGNEmitter = {}
YGNEmitter.__index = YGNEmitter

-- ocgcore location bitmasks
local LOCATION_DECK    = 0x01
local LOCATION_HAND    = 0x02
local LOCATION_MZONE   = 0x04
local LOCATION_SZONE   = 0x08
local LOCATION_GRAVE   = 0x10
local LOCATION_REMOVED = 0x20
local LOCATION_EXTRA   = 0x40

function YGNEmitter.new(player1_name, player2_name, format_name)
    local self = setmetatable({}, YGNEmitter)
    self.p1_name = player1_name or "Player 1"
    self.p2_name = player2_name or "Player 2"
    self.format = format_name or "TCG Advanced"
    self.current_turn = 0
    self.current_phase = "@M1"
    self.lines = {}
    self.chain_stack = {}
    self.resolving_chain = {}
    self.in_chain = false

    -- Write Metadata Header
    table.insert(self.lines, string.format('[Event "ocgcore Emitted Match"]'))
    table.insert(self.lines, string.format('[Player1 "%s" 8000]', self.p1_name))
    table.insert(self.lines, string.format('[Player2 "%s" 8000]', self.p2_name))
    table.insert(self.lines, string.format('[Format "%s"]', self.format))
    table.insert(self.lines, "")

    return self
end

function YGNEmitter:get_zone_name(player, location, sequence)
    local prefix = (player == 1) and "o." or ""

    if location == LOCATION_MZONE then
        if sequence == 5 then return "EL" end
        if sequence == 6 then return "ER" end
        return string.format("%sM%d", prefix, sequence + 1)
    elseif location == LOCATION_SZONE then
        if sequence == 5 then return string.format("%sFS", prefix) end
        return string.format("%sS%d", prefix, sequence + 1)
    elseif location == LOCATION_HAND then
        return string.format("%sH", prefix)
    elseif location == LOCATION_GRAVE then
        return string.format("%sGY", prefix)
    elseif location == LOCATION_REMOVED then
        return string.format("%sBX", prefix)
    elseif location == LOCATION_DECK then
        return string.format("%sD", prefix)
    elseif location == LOCATION_EXTRA then
        return string.format("%sED", prefix)
    end
    return "UNKNOWN"
end

function YGNEmitter:start_turn(turn_num, turn_player)
    self.current_turn = turn_num
    local name = (turn_player == 0) and self.p1_name or self.p2_name
    table.insert(self.lines, string.format("T%d: %s", turn_num, name))
    self.current_phase = "@M1"
end

function YGNEmitter:set_phase(phase_str)
    self.current_phase = phase_str
    table.insert(self.lines, phase_str)
end

function YGNEmitter:emit_normal_summon(player, card_name, dest_seq)
    local zone = self:get_zone_name(player, LOCATION_MZONE, dest_seq)
    table.insert(self.lines, string.format("  N[%s]>%s", card_name, zone))
end

function YGNEmitter:emit_special_summon(player, card_name, origin_loc, dest_seq, position)
    local origin = self:get_zone_name(player, origin_loc, 0)
    local zone = self:get_zone_name(player, LOCATION_MZONE, dest_seq)
    local pos_str = (position == 0x1 or position == 0x2) and "(atk)" or "(def)"
    table.insert(self.lines, string.format("  S[%s]%s>%s<%s", card_name, pos_str, zone, origin))
end

function YGNEmitter:chain_declare(link_num, player, card_name, loc, seq)
    local zone = self:get_zone_name(player, loc, seq)
    table.insert(self.chain_stack, string.format("C%d: A(%s)[%s]", link_num, zone, card_name))
    self.in_chain = true
end

function YGNEmitter:chain_resolve(link_num, result_text)
    table.insert(self.resolving_chain, string.format("R%d: %s", link_num, result_text))
end

function YGNEmitter:finish_chain()
    if #self.chain_stack > 0 then
        local decls = table.concat(self.chain_stack, " > ")
        local resols = (#self.resolving_chain > 0) and table.concat(self.resolving_chain, " > ") or "OK"
        table.insert(self.lines, string.format("  [%s // %s]", decls, resols))
    end
    self.chain_stack = {}
    self.resolving_chain = {}
    self.in_chain = false
end

function YGNEmitter:emit_lp_delta(player, delta, verified_lp)
    local p_str = (player == 0) and "P1" or "P2"
    local sign = (delta >= 0) and "+" or ""
    table.insert(self.lines, string.format("  %s.LP%s%d(%d)", p_str, sign, delta, verified_lp))
end

function YGNEmitter:get_transcript()
    return table.concat(self.lines, "\n")
end

return YGNEmitter
