import Cors from 'cors'
import cron from 'node-cron'

class Lib {

  constructor() {
    this.cors = Cors({ methods: ['GET', 'POST'] })

    this.midd = this.midd.bind(this)
  }

  rand ()       { return Math.random().toString(36).substr(2) }
  error(msg)    { return { error: true, msg }}
  success(opts) { return { error: false, ...opts }}

  midd(req, res) {
    return new Promise((resolve, reject) => {
      this.cors(req, res, (result) => {
        if (result instanceof Error) return reject(result)
        return resolve(result)
      })
    })
  }

  acum(a, query, field) {

    const x = Object.keys(query)[0]
    const y = Object.values(query)[0]

    return a
      .filter(i => i[x] == y)
      .map(i => i[field])
      .reduce((a, b) => a + b, 0)
  }

  ids(a) {
    return a.map(i => i.userId)
  }
  _ids(a) {
    return a.map(i => i.id)
  }
  parent_ids(a) {
    return a.map(i => i.parentId)
  }

  map(a) {
    return new Map(a.map(i => [i.id, i]))
  }
  _map(a) {
    return new Map(a.map(i => [i.userId, i]))
  }

  model(obj, model) {
    let ret = {}

    for(let key in obj)
      if(model.includes(key))
        ret[key] = obj[key]

    return ret
  }

  async getBalances(Transaction, userId) {
    const transactions = await Transaction.find({ user_id: userId })
    
    let available = { total: 0, lote: 0, membresia: 0 }
    let unavailable = { total: 0, lote: 0, membresia: 0 }
    
    for(let t of transactions) {
       const val = (t.type === 'in' ? 1 : -1) * t.value
       const type = t.activation_type ? t.activation_type.toUpperCase() : 'MEMBRESÍA' // Default to Membresía if missing? Or null.
       
       if (t.virtual) {
          // Unavailable (Usually only INs are virtual)
          unavailable.total += val
          if(type === 'LOTE') unavailable.lote += val
          else unavailable.membresia += val
       } else {
          // Available
          available.total += val
          // For breakdown, we can only reliably track INs. OUTs are untyped.
          // BUT, if we want to show "Earnings", we consider INs.
          // If we want "Balance", we have to assume net.
          // Let's track INs separately for breakdown.
          if(t.type === 'in') {
             if(type === 'LOTE') available.lote += t.value
             else available.membresia += t.value
          }
       }
    }
    
    return { available, unavailable }
  }
}


import initCron from '../cron/index'

const lib = new Lib()
lib.cron = cron

// initCron()

export default lib
