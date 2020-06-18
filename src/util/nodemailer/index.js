const nodemailer = require('nodemailer')
const fs = require('fs')

const { smtpAccount } = require('../../../config')

const auth = {
  user: smtpAccount['email'],
  pass: smtpAccount['password'],
}

const transporter = nodemailer.createTransport({
  service: 'gmail',
  auth,
})

const sendMail = async (email, subject, templateName, variables) => {
  if (!email || !subject || !templateName) throw 'missing parameters'

  const htmlFilePath = `./src/util/nodemailer/templates/${templateName}.html`
  const textFilePath = `./src/util/nodemailer/templates/${templateName}.txt`

  let htmlTemplate = fs.readFileSync(htmlFilePath, {encoding:'utf8', flag:'r'})
  let textTemplate = fs.readFileSync(textFilePath, {encoding:'utf8', flag:'r'})

  for (let [key, value] of Object.entries(variables)) {
    const re = new RegExp(`{{${key}}}`,"g")
    htmlTemplate = htmlTemplate.replace(re, value)
    textTemplate = textTemplate.replace(re, value)
  }

  const mailOptions = {
    from: smtpAccount['email'],
    to: email,
    subject,
    html: htmlTemplate,
    text: textTemplate,
  }

  transporter.sendMail(mailOptions, (error, info) => {
    if (error) console.error(error)
    else console.log('Email sent: ' + info.response)
  })

}

module.exports = {
  sendMail,
}
