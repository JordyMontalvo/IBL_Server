import db from '../../../components/db'
import lib from '../../../components/lib'

const { Product, Plan } = db
const { midd, success, rand } = lib

export default async (req, res) => {
  await midd(req, res)

  if (req.method == 'GET') {
    let products = await Product.find({})

    // response
    return res.json(
      success({
        products,
      })
    )
  }

  if (req.method == 'POST') {

    const { action } = req.body

    if (action == 'edit') {
      const { id } = req.body
      const data = req.body.data
      
      const updateData = {
        id: data._code !== undefined ? data._code : data.code,
        name: data._name !== undefined ? data._name : data.name,
        type: data._type !== undefined ? data._type : data.type,
        price: data._price !== undefined ? data._price : data.price,
        points: data._points !== undefined ? data._points : data.points,
        img: data._img !== undefined ? data._img : data.img,
        description: data._description !== undefined ? data._description : data.description,
        subtitle: data._subtitle !== undefined ? data._subtitle : data.subtitle,
        duration: data._duration !== undefined ? data._duration : data.duration,
        area: data._area !== undefined ? data._area : data.area,
        location: data._location !== undefined ? data._location : data.location,
        active: data.active,
        order: data.order,
        tag: data.tag,
        title: data.title,
        duration_type: data.duration_type,
        benefits: data.benefits,
      }
      
      // Clean undefined properties
      Object.keys(updateData).forEach(key => updateData[key] === undefined && delete updateData[key])

      await Product.update(
        { id },
        updateData
      )
    }

    if (action == 'add') {
      const data = req.body.data
      
      const insertData = {
        id: rand(),
        code: data.code,
        name: data.name,
        type: data.type,
        price: data.price,
        points: data.points,
        img: data.img,
        description: data.description,
        subtitle: data.subtitle,
        duration: data.duration,
        area: data.area,
        location: data.location,
        active: data.active,
        order: data.order,
        tag: data.tag,
        title: data.title,
        duration_type: data.duration_type,
        benefits: data.benefits,
      }
      
      // Clean undefined properties
      Object.keys(insertData).forEach(key => insertData[key] === undefined && delete insertData[key])

      await Product.insert(insertData)
    }

    if (action == 'delete') {
      const { id } = req.body
      await Product.delete({ id })
    }

    // response
    return res.json(success({}))
  }
}
