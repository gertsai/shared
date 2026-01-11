-- version 21
local key = KEYS[1]

local timeFrame = tonumber(ARGV[1]) -- timeFrame in milliseconds
local rateLimit = tonumber(ARGV[2]) -- requests per timeFrame
local currentTime = tonumber(ARGV[3]) -- current time in milliseconds

redis.replicate_commands()

local quarterTimeFrame = timeFrame / 4
local currentWindowStart = currentTime - (currentTime % timeFrame)
local previousWindowEnd = currentWindowStart - 1
local windowElapsedTime = currentTime - currentWindowStart

-- Calculate the coefficient for weighting previous window's requests
local previousWindowWeight = 0.0
if windowElapsedTime <= quarterTimeFrame then
    previousWindowWeight = 0.75
end

-- Remove old requests outside of the previous window
local previousWindowStart = previousWindowEnd - timeFrame
redis.call('ZREMRANGEBYSCORE', key, 0, previousWindowStart)

-- Count requests in the current window
local currentWindowRequests = redis.call('ZCOUNT', key, tostring(currentWindowStart), tostring(currentTime))

-- Count requests in the previous window and apply weighting
local previousWindowRequests = redis.call('ZCOUNT', key, tostring(previousWindowStart), tostring(previousWindowEnd))
local weightedPreviousRequests = math.floor(previousWindowRequests * previousWindowWeight)

-- Calculate total weighted requests
local totalWeightedRequests = currentWindowRequests + weightedPreviousRequests

if totalWeightedRequests < rateLimit then
    -- Add current request with current timestamp
    redis.call('ZADD', key, currentTime, tostring(currentTime))
    -- Set expiration to manage auto cleanup
    redis.call('PEXPIRE', key, timeFrame * 2) -- Expire at the end of the next window
    -- allow=1, totalHits (after increment), remainingHits, reset
    return {1, totalWeightedRequests + 1, rateLimit - totalWeightedRequests - 1, timeFrame - windowElapsedTime}
else
    local oldestTime = redis.call('ZRANGE', key, 0, 0, 'WITHSCORES')[2]
    local resetTime = math.max(oldestTime + timeFrame - currentTime, 0)
    -- allow=0, totalHits (at limit), remaining=0, reset
    return {0, rateLimit, 0, resetTime}
end

