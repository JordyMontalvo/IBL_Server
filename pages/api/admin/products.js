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
      // console.log('edit ...')

      const { id } = req.body
      const { 
        _name, 
        _type, 
        _price, 
        _points, 
        _img, 
        _code, 
        _description,
        _subtitle,
        _duration,
        _area,
        _location
      } = req.body.data

      // const beforeProductData = (await Product.find({ id }))[0]
      // console.log('beforeProductData', beforeProductData)
      await Product.update(
        { id },
        {
          id: _code,
          name: _name,
          type: _type,
          price: _price,
          points: _points,
          img: _img,
          description: _description,
          subtitle: _subtitle,
          duration: _duration,
          area: _area,
          location: _location,
        }
      )
      // await Plan.updateMany(
      //   { 'products.id': id },
      //   {
      //     'products.$.id': _code,
      //   }
      // )
    }

    if (action == 'add') {
      // console.log('add ...')

      const { 
        code, 
        name, 
        type, 
        price, 
        points, 
        img, 
        description,
        subtitle,
        duration,
        area,
        location 
      } = req.body.data

      await Product.insert({
        id: rand(),
        code,
        name,
        type,
        price,
        points,
        img,
        description,
        subtitle,
        duration,
        area,
        location,
      })
    }

    if (action == 'delete') {
      const { id } = req.body
      await Product.delete({ id })
    }

    // response
    return res.json(success({}))
  }
}
