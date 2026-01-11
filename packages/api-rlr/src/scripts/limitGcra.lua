-- GCRA limiter (per bucket)
-- KEYS[1] = key
-- ARGV[1] = timeFrame (ms)
-- ARGV[2] = limit (requests per timeFrame)
-- ARGV[3] = burst (additional capacity)
-- ARGV[4] = currentTime (ms)

local key = KEYS[1]
local timeFrame = tonumber(ARGV[1])
local limit = tonumber(ARGV[2])
local burst = tonumber(ARGV[3])
local now = tonumber(ARGV[4])

-- inter-arrival time per request
local I = math.floor(timeFrame / math.max(1, limit))
-- allow burst: virtual backlog L (requests)
local L = tonumber(burst)

local tat = tonumber(redis.call('GET', key) or '0')
if tat == nil then tat = 0 end

if tat == 0 then
  tat = now
end

local earliest = tat - (L * I)
local allow = 0
local retryAfter = 0

if now >= earliest then
  allow = 1
  local newTat = math.max(tat, now) + I
  redis.call('SET', key, newTat)
  redis.call('PEXPIRE', key, timeFrame * 2)
else
  allow = 0
  retryAfter = earliest - now
end

-- remaining is approximate; compute based on distance to limit edge
local remaining = 0
if allow == 1 then
  remaining = L
else
  remaining = 0
end

return { allow, remaining, retryAfter }


