const jwt = require('jsonwebtoken')


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
  const { headers } = req
  const { authorization } = headers
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
  const { checkUser, params = {} } = req
  const { sid } = params

  if (!sid) return res.sendStatus(401)
  
  let user = await checkUser({sid}, null, true)
  if (!user) return res.sendStatus(401)

  // reduce user data
  user.sid = sid
  user = reduceUserData(user)

  // create a jwt form the fetched valid user
  const accessToken = jwt.sign(user, process.env.ACCESS_TOKEN_SECRET, { expiresIn: '12m' })
  const refreshToken = jwt.sign(user, process.env.REFRESH_TOKEN_SECRET, { expiresIn: '9d' })
  storeRefreshToken(refreshToken)

  const payload = {
    accessToken,
    refreshToken,
  }
  return res.send(payload)
}

async function verifyToken(req, res) {
  const { headers } = req
  const { authorization } = headers
  const token = authorization && authorization.split(' ')[1]
  if (!token) return res.sendStatus(401)

  jwt.verify(token, process.env.ACCESS_TOKEN_SECRET, (err, user) => {
    if (err) return res.sendStatus(403)
    console.log({user})
    return res.send("VERIFIED")
  })
}

async function removeToken(req, res) {
  const { body = {} } = req
  const { token: refreshToken } = body
  const { headers } = req
  const { authorization } = headers
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


// helpers
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
  removeToken,
  verifyToken,
}