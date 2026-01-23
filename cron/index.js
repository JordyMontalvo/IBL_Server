import cron from 'node-cron'
import db from '../components/db'

const { User, Transaction } = db

let task = null

export default () => {

  if(task) return

  console.log('Initializing Cron Job...')

  // Run at 00:00 on day 1 of the month
  task = cron.schedule('0 0 1 * *', async () => {
    console.log('Running Month End Closing...')
    
    // 1. Get all transactions with virtual: true
    const transactions = await Transaction.find({ virtual: true })
    
    // cache users
    const users = await User.find({})
    const userMap = new Map(users.map(u => [u.id, u]))
    
    for (const tx of transactions) {
       const user = userMap.get(tx.user_id)
       if (!user) continue
       
       let isActive = false
       
       // Handle types: MEMBRESÍA/MEMBRESIA and LOTE
       const type = tx.activation_type ? tx.activation_type.toUpperCase() : null
       
       if ((type === 'MEMBRESÍA' || type === 'MEMBRESIA') && user._activated) isActive = true
       if (type === 'LOTE' && user.activated) isActive = true
       
       if (isActive) {
          // User activated in time! Make available.
          console.log(`Making transaction ${tx.id} available for user ${user.id}`)
          await Transaction.update({ id: tx.id }, { virtual: false })
       } else {
         // User failed to activate. Delete.
         console.log(`Deleting expired transaction ${tx.id} for user ${user.id}`)
         await Transaction.delete({ id: tx.id })
       }
    }
    
    console.log('Month End Closing Complete.')
  })
}
