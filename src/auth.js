const jwt = require('jsonwebtoken')

// config
const tokenLifespan = {
  access: '45m',
  refresh: '9d',
}


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
  const { headers: { authorization } } = req
  const token = authorization && authorization.split(' ')[1]
  if (!token) return res.sendStatus(401)

  jwt.verify(token, process.env.ACCESS_TOKEN_SECRET, (err, user) => {
    if (err) return res.sendStatus(403)
    req.user = user
    next()
  })
}


// core token functions
async function getToken(req, res) {
  const { checkUser, params: { sid } } = req

  if (!sid) return res.sendStatus(401)
  
  let user = await checkUser({sid}, null, true)
  if (!user) return res.sendStatus(401)

  // reduce user data
  user.sid = sid
  user = reduceUserData(user)

  // create a jwt form the fetched valid user
  const accessToken = createAccessToken(user)
  const refreshToken = createRefreshToken(user)

  const payload = {
    accessToken,
    refreshToken,
  }
  return res.send(payload)
}

async function verifyToken(req, res) {
  const { headers: { authorization } } = req
  const token = authorization && authorization.split(' ')[1]
  if (!token) return res.sendStatus(401)

  jwt.verify(token, process.env.ACCESS_TOKEN_SECRET, (err, user) => {
    if (err) return res.sendStatus(403)
    return res.send("VERIFIED")
  })
}

async function removeToken(req, res) {
  const {
    body: {token: refreshToken },
    headers: { authorization },
  } = req
  const accessToken = authorization && authorization.split(' ')[1]

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
      return res.status(200).send('DELETED')
    })
  })
}

async function refreshToken(req, res) {
  let {
    body: { token: refreshToken },
  } = req
  if (!refreshToken) return res.sendStatus(400)

  let refreshTokenUser = await jwt.verify(refreshToken, process.env.REFRESH_TOKEN_SECRET)
  if (!refreshTokenUser ) return res.sendStatus(403)

  const foundToken = refreshTokens.find(token => token === refreshToken)
  if (!foundToken) return res.sendStatus(204)

  // remove the refresh token just used
  removeRefreshToken(refreshToken)

  // create new access token and refresh token to return in response
  refreshTokenUser = reduceUserData(refreshTokenUser)
  const accessToken = createAccessToken(refreshTokenUser)
  refreshToken = createRefreshToken(refreshTokenUser)
  const response = {
    accessToken,
    refreshToken,
  }
  return res.send(response)

}


// helpers
function createAccessToken(user) {
  return jwt.sign(
    user,
    process.env.ACCESS_TOKEN_SECRET,
    { expiresIn: tokenLifespan.access }
  )
}
function createRefreshToken(user) {
  const refreshToken = jwt.sign(
    user,
    process.env.REFRESH_TOKEN_SECRET,
    { expiresIn: tokenLifespan.refresh }
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
  refreshToken,
  removeToken,
  verifyToken,
}