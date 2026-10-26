import db  from "../../../components/db"
import lib from "../../../components/lib"

const { User, Session } = db
const { error, success, midd } = lib


export default async (req, res) => {
  await midd(req, res)

  let { session } = req.query

  // valid session
  session = await Session.findOne({ value: session })
  if(!session) return res.json(error('invalid session'))

  // get user
  const user = await User.findOne({ id: session.id })


  if(req.method == 'GET') {

    const bank         = user.bank         ? user.bank         : null
    const account_type = user.account_type ? user.account_type : null
    const account      = user.account      ? user.account      : null
    const ibk          = user.ibk          ? user.ibk          : null

    // response
    return res.json(success({
      affiliated: user.affiliated,
     _activated:  user._activated,
      activated:  user.activated,
      plan:       user.plan,
      country:    user.country,
      photo:      user.photo,
      tree:       user.tree,

      country:      user.country,
      dni:          user.dni,
      name:         user.name,
      lastName:     user.lastName,
      email:        user.email,
      phone:        user.phone,
      birthdate:    user.birthdate,
      address:      user.address,
      token:        user.token,

      bank,
      account_type,
      account,
      ibk,
    }))
  }

  if(req.method == 'POST') {

    let { email, phone, age, address, bank, account_type, account, ibk, birthdate } = req.body

    email = email ? email.toLowerCase().replace(/ /g,'') : ''

    const values = { email, phone, age, address, bank, account_type, account, ibk }

    // fecha de nacimiento (YYYY-MM-DD): solo si llega y es válida, no futura ni anterior a 1900
    if (birthdate !== undefined && birthdate !== null && birthdate !== '') {
      const valid = /^\d{4}-\d{2}-\d{2}$/.test(birthdate) && !isNaN(new Date(birthdate + 'T00:00:00Z'))
      const today = new Date().toISOString().slice(0, 10)
      if (!valid || birthdate > today || birthdate < '1900-01-01') return res.json(error('Fecha de nacimiento inválida'))
      values.birthdate = birthdate
    }

    // update user
    await User.update({ id: user.id }, values)

    // response
    return res.json(success())
  }
}
