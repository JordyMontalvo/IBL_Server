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
    // Broadest query to capture all purchase variations where this user is the buyer
    // Broadest query to capture all purchase variations where this user is the buyer
    const userQuery = { 
        $or: [
            { userId: user.id }, 
            { user_id: user.id },
            { 'buyer.id': user.id }, 
            { 'buyer._id': user.id }, // Potential variations
            { 'buyer.userId': user.id },
            { 'buyer.dni': user.dni }, 
             { buyer: user.id }
        ]
    }
    
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
