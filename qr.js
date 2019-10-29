const decodeImage = require('jimp').read
const qrcodeReader = require('qrcode-reader')
// qrDecode("qr.png",function(data){
//     console.log(data)
// })
const qrDecode = (data) => {
  return new Promise((resolve, reject) => {
    decodeImage(data, function (err, image) {
      if (err) {
        reject(false)
        return
      }
      let decodeQR = new qrcodeReader()
      decodeQR.callback = function (errorWhenDecodeQR, result) {
        if (errorWhenDecodeQR) {
          reject(false)
          return
        }
  
        if (! result) {
          reject(false)
          return
        } else {
          resolve(result.result)
        }
      }
      decodeQR.decode(image.bitmap)
    })
  })
}

module.exports = {
  qrDecode
}

// qrDecode('./qr.png').then(res => console.log(res))