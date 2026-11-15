# Changelog

What each release changed for you, newest first. Each line is a commit's summary, linked to its full description and diff.

## 1.0.2 - 2026-11-15

### Features

- Require internetdata 2.11.0: hosted_domains lists its 10 most popular domains ([`c958c29`](https://github.com/internetdata/sdk-nodejs-expressjs/commit/c958c29ea495dcfc2c9d743f462f56c5ed84524a))

## 1.0.1 - 2026-11-14

### Fixes

- Require @internetdata/internetdata 2.10.1: a 403 can mean the key lacks the ip.lookup scope ([`b224314`](https://github.com/internetdata/sdk-nodejs-expressjs/commit/b224314fa96b59e058ef6dd7714f1a19a9c33ae5))

## 1.0.0 - 2026-11-14

### Features

- Attach the visitor's InternetData record to every request as `req.internetdata`: the location, the network and the company behind the address, and the anonymity and hosting flags your plan serves ([`4b1b46d`](https://github.com/internetdata/sdk-nodejs-expressjs/commit/4b1b46d32e789d5078486c4478584b27ae25d52d))
- Refuse a request with a `blockCondition` written in the shape of a result, by country, network type, anonymity or any other member, with 403 or an `onBlocked` of your own ([`4b1b46d`](https://github.com/internetdata/sdk-nodejs-expressjs/commit/4b1b46d32e789d5078486c4478584b27ae25d52d))
- Choose where the client address comes from: `req.ip` by default, `xffIpSelector`, `headerIpSelector` for a header your edge writes, or a function of your own ([`4b1b46d`](https://github.com/internetdata/sdk-nodejs-expressjs/commit/4b1b46d32e789d5078486c4478584b27ae25d52d))
- Fail open on any lookup failure unless `failClosed` is set, with a 2500 ms bound, no retry and a cache per middleware by default ([`4b1b46d`](https://github.com/internetdata/sdk-nodejs-expressjs/commit/4b1b46d32e789d5078486c4478584b27ae25d52d))
