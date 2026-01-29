import db  from "../../../components/db"
import lib from "../../../components/lib"

const { User, Session, Activation, Membership, Lot } = db
const { error, success, midd } = lib


// function light(a, b, c) {

//   if(a != null && b != null && c != null) {

//     if(a >= 250 && b >= 450)
//       if(c >= 650) return [1, 1, 1]
//       else         return [1, 1, 0]
//   }

//   if (b != null && c != null) {

//     if(b >= 250)
//       if(c >= 450) return [1, 1, 0]
//       else         return [1, 0, 0]
//   }

//   if(c >= 250) return [1, 0, 0]
//   else         return [0, 0, 0]
// }



export default async (req, res) => {
  await midd(req, res)

  let { session } = req.query

  // valid session
  session = await Session.findOne({ value: session })
  if(!session) return res.json(error('invalid session'))

  // check verified
  const user = await User.findOne({ id: session.id })
  // if(!user.verified) return res.json(error('unverified user'))


  if(req.method == 'GET') {

    // get activations, memberships, lots
    // Build exhaustive conditions to find the user in the purchase record
    const conditions = []

    // 1. Check by Custom ID (user.id)
    if (user.id) {
        conditions.push({ userId: user.id })      // Standard
        conditions.push({ user_id: user.id })     // Legacy/Alt
        conditions.push({ 'buyer.id': user.id })  // Buyer Object
        conditions.push({ 'buyer.userId': user.id }) 
    }

    // 2. Check by DNI (National ID)
    if (user.dni) {
        conditions.push({ 'buyer.dni': user.dni })
        // Try identifying as 'cedula' just in case
        conditions.push({ 'buyer.cedula': user.dni })
        // Handle potential string vs number type mismatch for DNI
        if (typeof user.dni === 'string') {
             // If valid number, check number version too
             const num = Number(user.dni)
             if (!isNaN(num)) conditions.push({ 'buyer.dni': num })
        } else {
             // If number, check string version
             conditions.push({ 'buyer.dni': String(user.dni) })
        }
    }

    // 3. Check by Email (Robust fallback)
    if (user.email) {
        conditions.push({ 'buyer.email': user.email })
    }

    // 4. Check by MongoDB ObjectId (user._id)
    if (user._id) {
        const oid = user._id
        const oidStr = user._id.toString()
        
        conditions.push({ 'buyer._id': oid })      // Match ObjectId
        conditions.push({ 'buyer.id': oid })       // In case stored as ObjectId in id field
        conditions.push({ 'buyer._id': oidStr })   // Match String representation
        conditions.push({ 'buyer.id': oidStr })    // Match String in id field
    }

    // 5. Check inside 'transactions' array (Common in this schema)
    if (user.id) {
        conditions.push({ 'transactions.user_id': user.id })
        conditions.push({ 'transactions._user_id': user.id }) // Sometimes stored as reference
    }

    // 6. Fallback: Search by Name (Case Insensitive Regex) - Last resort if IDs fail
    // This helps if the record has 'buyer.name' but no valid ID
    if (user.name) {
        try {
            const nameRegex = new RegExp(user.name, 'i')
            conditions.push({ 'buyer.name': nameRegex })
        } catch (e) {}
    }
    
    // 7. Fallback: Search by Email inside buyer object (incase it wasn't caught above)
    if (user.email) {
        conditions.push({ 'buyer.email': user.email })
    }

    // 8. FINAL FALLBACK: Check 'sellerId'. 
    // In some edge cases (e.g. self-registration or specific legacy data), 
    // the user might be listed as the seller but considers it their record.
    // The user explicitly requested to see records where they appear as sellerId if buyer is empty/invalid.
    if (user.id) {
        conditions.push({ sellerId: user.id })
    }

    const userQuery = { $or: conditions }
    
    // Debug log (server side)
    console.log('Searching memberships/lots for user:', user.name, 'Conditions:', JSON.stringify(conditions))

    let activations = await Activation.find({ userId: user.id }) 
    let memberships = await Membership.find(userQuery) 
    let lots        = await Lot.find(userQuery)

    // Normalize Memberships
    const membershipsNormalized = memberships.map(m => {
        let name = m.name || ''
        if (!name.toUpperCase().includes('MEMBRESÍA') && !name.toUpperCase().includes('MEMBRESIA')) {
            name = 'Membresía ' + name
        }
        
        return {
            ...m,
            id: m.id,
            date: m.date || new Date(),
            price: m.price || 0,
            points: m.points || 0,
            voucher: m.voucher || null,
            status: m.status,
            products: [{ name: name, total: 1, image: m.productImg }],
            type: 'MEMBRESÍA'
        }
    })

    // Normalize Lots
    const lotsNormalized = lots.map(l => {
        let name = l.name || ''
        if (!name.toUpperCase().includes('LOTE')) {
            name = 'Lote ' + name
        }

        return {
            ...l,
            id: l.id,
            date: l.date || new Date(),
            price: l.price || 0,
            points: l.points || 0,
            voucher: l.voucher || null,
            status: l.status,
            products: [{ name: name, total: 1, image: l.productImg }],
            type: 'LOTE'
        }
    })

    // Merge all
    activations = [...activations, ...membershipsNormalized, ...lotsNormalized]
    
    // Sort by date desc
    activations.sort((a, b) => new Date(b.date) - new Date(a.date))

    // const all_points = user.all_points
    // const n = all_points.length

    // const a = (n >= 3 && !all_points[n-3].payed) ? all_points[n-3].val : null
    // const b = (n >= 2 && !all_points[n-2].payed) ? all_points[n-2].val : null
    // const c = (n >= 1 && !all_points[n-1].payed) ? all_points[n-1].val : null

    // console.log({ a, b, c})

    // let arr = light(a, b, c)


    // response
    return res.json(success({
      name:       user.name,
      lastName: user.lastName,
      affiliated: user.affiliated,
      activated:  user.activated,
      plan:       user.plan,
      country:    user.country,
      photo:      user.photo,
      tree:       user.tree,

      activations,
      // arr,
    }))
  }
}
