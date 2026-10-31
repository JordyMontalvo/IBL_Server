import db from '../../../components/db'
import lib from '../../../components/lib'

const { Product, Plan } = db
const { midd, success, error, rand } = lib

export default async (req, res) => {
  await midd(req, res)

  if (req.method == 'GET') {
    let products = await Product.find({ deleted: { $ne: true } })

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

      if (updateData.id !== undefined && String(updateData.id) !== String(id)) {
        const queryIds = [{ id: updateData.id }, { id: String(updateData.id) }]
        if (!isNaN(Number(updateData.id))) {
          queryIds.push({ id: Number(updateData.id) })
        }
        const existing = await Product.find({ $or: queryIds })
        const otherExists = existing.some(p => String(p.id) !== String(id))
        if (otherExists) {
          return res.json(error('El código ya está en uso por otro producto'))
        }
      }

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

      const blank = v => v === undefined || v === null || String(v).trim() === ''
      if (blank(insertData.name) || blank(insertData.type) || blank(insertData.price)) {
        return res.json(error('Nombre, tipo y precio son obligatorios'))
      }

      const activeProducts = await Product.find({ deleted: { $ne: true } })
      const norm = s => (s !== undefined && s !== null ? String(s).trim().toLowerCase() : '')

      const isDuplicate = activeProducts.some(p => {
        const sameCode = insertData.code && (
          (p.code !== undefined && String(p.code) === String(insertData.code)) ||
          (p.id !== undefined && String(p.id) === String(insertData.code))
        )
        const sameNameAndType = insertData.name && insertData.type &&
          norm(p.name) === norm(insertData.name) &&
          norm(p.type) === norm(insertData.type)

        return Boolean(sameCode || sameNameAndType)
      })

      if (isDuplicate) {
        return res.json(error('Ya existe un producto con ese código o nombre'))
      }

      await Product.insert(insertData)
    }

    if (action == 'delete') {
      const { id } = req.body
      await Product.softDelete({ id })
    }

    // response
    return res.json(success({}))
  }
}
