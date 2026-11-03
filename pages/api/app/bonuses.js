import db  from "../../../components/db"
import lib from "../../../components/lib"
import { computeRanks } from "../../../components/ranks"

const { User, Session, Transaction } = db
const { error, success, midd, acum } = lib


const handler = async (req, res) => {

  let { session } = req.query

  // valid session
  session = await Session.findOne({ value: session })
  if(!session) return res.json(error('invalid session'))

  // get USER
  const user = await User.findOne({ id: session.id })

  const bonuses = {
    sapphire: [],
    ruby: [],
    gold: [],
    diamond: [],
  }

  // rangos por ventas de membresías (período de dos ciclos + histórico)
  const ranks = await computeRanks(user)

  // response
  return res.json(success({
    pays:    user.pays,
    bonuses: user.bonuses || bonuses,
    ranks,
  }))
}

export default async (req, res) => { await midd(req, res); return handler(req, res) }
