const jwt = require('jsonwebtoken')

// config
const tokenLifespan = {
  access: {
    milliseconds: 10*60*1000,
    unitMeasurement: '10m',
  },
  refresh: {
    milliseconds: 9*24*60*60*1000,
    unitMeasurement: '9d',
  },
}
const jwTokenCookieName = 'ftl-jwt'
const jwRefreshTokenCookieName = 'ftl-refresh-jwt'

/** @todo Store encrypted refresh tokens in the db */
// storage
let refreshTokens = new Array()

function storeRefreshToken(refreshToken) {
  refreshTokens.push(refreshToken)
}

function removeRefreshToken(refreshToken) {
  refreshTokens = refreshTokens.filter(token => token !== refreshToken)
}


// middleware function for authorization
function authenticateToken(req, res, next) {
  const {
    cookies: {
      [jwTokenCookieName]: token,
      [jwRefreshTokenCookieName]: refreshToken,
    }
  } = req
  if (!token && !refreshToken) return res.sendStatus(403)

  jwt.verify(token, process.env.ACCESS_TOKEN_SECRET, (err, user) => {
    if (err) {
      // the access token cannot be verified so we validate the refresh token
      jwt.verify(refreshToken, process.env.REFRESH_TOKEN_SECRET, (err, refreshTokenUser) => {
        if (err) return res.sendStatus(403)
        req.user = refreshTokenUser
      })
    }
    else req.user = user
    
    if (req.user) {
      // create a fresh token
      const accessToken = createAccessToken( reduceUserData(req.user) )

      // return the the access token as an HttpOnly cookie
      res = setJwtCookie(res, jwTokenCookieName, accessToken)
    }
    return next()
  })
}


// core token functions
function setJwtCookie(res, cookieName, token, expire) {
  let expires = new Date()
  const milliseconds = expire ? -1000 : (
    cookieName === jwTokenCookieName ? tokenLifespan.access.milliseconds
    : tokenLifespan.refresh.milliseconds
  )
  expires.setMilliseconds(milliseconds)
  res.cookie(
    cookieName,
    token,
    {
      expires,
      httpOnly: true,
      secure: process.env.FTL_ENV !== 'local',
    }
  )
  return res
}

async function getToken(req, res) {
  const { checkUser, params: { sid } } = req
  if (!sid) return res.sendStatus(401)
  
  let user = await checkUser({sid}, null, true)
  if (!user) return res.sendStatus(401)

  // reduce user data
  user.sid = sid
  user = reduceUserData(user)

  // create a jwt from the valid fetched user
  const accessToken = createAccessToken(user)
  const refreshToken = createRefreshToken(user)

  // return the refresh tokens as httponly cookies
  res = setJwtCookie(res, jwTokenCookieName, accessToken)
  res = setJwtCookie(res, jwRefreshTokenCookieName, refreshToken)
  return res.end()
}

async function verifyToken(req, res) {
  const {
    cookies: {
      [jwTokenCookieName]: token,
    }
  } = req
  if (!token) return res.sendStatus(401)

  jwt.verify(token, process.env.ACCESS_TOKEN_SECRET, (err, user) => {
    if (err) return res.sendStatus(403)
    return res.send("VERIFIED")
  })
}

async function removeToken(req, res) {
  const {
    cookies: {
      [jwTokenCookieName]: accessToken,
      [jwRefreshTokenCookieName]: refreshToken,
    }
  } = req

  jwt.verify(accessToken, process.env.ACCESS_TOKEN_SECRET, (err, accessTokenUser) => {
    if (err || !accessTokenUser) return res.sendStatus(403)

    jwt.verify(refreshToken, process.env.REFRESH_TOKEN_SECRET, (err, refreshTokenUser) => {
      if (
        err
        || !refreshTokenUser
        || accessTokenUser['email'] !== refreshTokenUser['email']
      ) return res.sendStatus(403)

      const foundToken = refreshTokens.find(token => token === refreshToken)
      if (!foundToken) return res.sendStatus(204)

      removeRefreshToken(refreshToken)
      res = setJwtCookie(res, jwTokenCookieName, '', true)
      res = setJwtCookie(res, jwRefreshTokenCookieName, '', true)
      return res.status(200).send('DELETED')
    })
  })
}


// helpers
function createAccessToken(user) {
  return jwt.sign(
    user,
    process.env.ACCESS_TOKEN_SECRET,
    { expiresIn: tokenLifespan.access.unitMeasurement }
  )
}
function createRefreshToken(user) {
  const refreshToken = jwt.sign(
    user,
    process.env.REFRESH_TOKEN_SECRET,
    { expiresIn: tokenLifespan.refresh.unitMeasurement }
  )
  storeRefreshToken(refreshToken)
  return refreshToken
}
function reduceUserData(user) {
    return {
      email: user.email,
      github_token: user.github_token,
      sid: user.sid,
    }
}


// exports
module.exports = {
  authenticateToken,
  getToken,
  // refreshToken,
  removeToken,
  verifyToken,
}