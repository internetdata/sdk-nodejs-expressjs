# Changelog

What each release changed for you, newest first. Each line is a commit's summary, linked to its full description and diff.

## 1.0.8 - 2026-11-20

### Fixes

- Require internetdata 2.15.0: a paid domain answer's hosting, home page and linking domains ([`dff0d42`](https://github.com/internetdata/sdk-nodejs-expressjs/commit/dff0d426e21aca80d3f59a7b3e462327c88e7f8a))

## 1.0.7 - 2026-11-20

### Fixes

- Require internetdata 2.14.2: the spec re-pinned to 2026.11.20 ([`d5eb3d2`](https://github.com/internetdata/sdk-nodejs-expressjs/commit/d5eb3d29d2711b91570b422e0427176755322f11))

## 1.0.6 - 2026-11-19

### Fixes

- Require internetdata 2.14.1: a reduced answer is cached a minute at most ([`819cda7`](https://github.com/internetdata/sdk-nodejs-expressjs/commit/819cda75b61225df4ac1208677d2dfe23e0a97ab))

## 1.0.5 - 2026-11-18

### Fixes

- Require internetdata 2.14.0: every request names the SDK ([`d4f6f66`](https://github.com/internetdata/sdk-nodejs-expressjs/commit/d4f6f66c4cb14747f052c14edcc6d1d3415e831a))

## 1.0.4 - 2026-11-17

### Features

- Require internetdata 2.13.0: cap_reached on a paid answer past its overage cap ([`1d76c63`](https://github.com/internetdata/sdk-nodejs-expressjs/commit/1d76c6366669c20b89c6af6f9c8c46909c3db19c))

## 1.0.3 - 2026-11-16

### Features

- Require internetdata 2.12.0: an AS's rank, neighbors and hosted domains ([`a14a4c4`](https://github.com/internetdata/sdk-nodejs-expressjs/commit/a14a4c42ce364002ffdf54cab810dc75f442b45f))

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
