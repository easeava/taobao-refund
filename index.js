require('chromedriver')
const { Builder, By, until } = require('selenium-webdriver')
const chrome = require('selenium-webdriver/chrome')
const fs = require('fs')
const path = require('path')
const request = require('request')
const iconv = require('iconv-lite')
const inquirer = require('inquirer')
const qrCode = require('qrcode-terminal')
require('colors')
const { qrDecode } = require('./qr')

const COOKIE_PATH = path.resolve(__dirname, 'cookies.json')

const seleniumDriver = async () => {
  return await new Builder().forBrowser('chrome').setChromeOptions(
    new chrome.Options().excludeSwitches('enable-automation').headless()
  ).build()
}

const login = (driver) => {
  return new Promise(async (resolve, reject) => {
    try {
      await driver.get('https://login.taobao.com/member/login.jhtml')
      await driver.wait(until.elementLocated(By.id('J_QRCodeImg')), 10000)
      const imgSrc = await driver.findElement(By.xpath('//*[@id="J_QRCodeImg"]/img')).getAttribute('src')
      const cookies = await driver.manage().getCookies()
      let _cookies = ''
      cookies.map(item => _cookies += `${item.name}=${item.value};`)

      request({
        url: imgSrc,
        headers: {
          'origin': 'https://buyertrade.taobao.com',
          'referer':'https://buyertrade.taobao.com/trade/itemlist/list_bought_items.htm',
          'user-agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_0) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/77.0.3865.120 Safari/537.36',
          'cookie': _cookies
        }
      }).pipe(
        fs.createWriteStream(`./qr.png`).on('close', err => {  
          if (err) {
            reject(err)
            return
          }
        }).on('finish', () => {
          resolve()
        })
      )    
    } catch (error) {
      reject(error)
    }
  })
}

const saveCookies = (driver) => {
  return new Promise(async (resolve, reject) => {
    try {
      const cookies = await driver.manage().getCookies()
      fs.writeFileSync(COOKIE_PATH, JSON.stringify(cookies))
      resolve()
    } catch (error) {
      reject(error)
    }
  })
}

const cookieExists = () => {
  return new Promise((resolve) => {
    fs.access(COOKIE_PATH, fs.constants.F_OK, err => {
      resolve(err ? false : true)
    })
  })
}

const getLists = (driver) => {
  return new Promise(async (resolve) => {
    let ids = []
    await driver.get('https://buyertrade.taobao.com/trade/itemlist/list_bought_items.htm')

    await driver.wait(until.elementLocated(By.className('js-order-container')), 10000)
    // 获取列表订单
    const lists = await driver.findElements(By.className('js-order-container'))
    for (let item of lists) {
      const str = await item.getText()
      
      if (str.indexOf('退款/退货') === -1) {
        continue
      }

      const orderID = /订单号:\s+(\d+)/.exec(str)[1]
      ids.push(orderID)
    }

    resolve(ids)
  })
}

const readOrderLists = (pageSize) => {
  return new Promise((resolve, reject) => {

    const cookies = require(COOKIE_PATH)

    let _cookies = ''
    cookies.map(item => _cookies += `${item.name}=${item.value};`)

    request.post('https://buyertrade.taobao.com/trade/itemlist/asyncBought.htm?action=itemlist/BoughtQueryAction&event_submit_do_query=1&_input_charset=utf8', {
      form: {
        pageNum: 1,
        pageSize,
        // prePageNo: 2
      },
      headers: {
        'origin': 'https://buyertrade.taobao.com',
        'referer':'https://buyertrade.taobao.com/trade/itemlist/list_bought_items.htm',
        'user-agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_0) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/77.0.3865.120 Safari/537.36',
        'cookie': _cookies
      },
      encoding: 'binary'
    }, (err, response, body) => {
      if (err) {
        reject(err)
        return
      }
      body = JSON.parse(iconv.decode(body, 'GBK'))
      resolve(body)
    })
  })
}

const refundOrderPost = data => {
  return new Promise((resolve, reject) => {
    // https://refund2.tmall.com/dispute/adjust/adjustApply.json

    const cookies = require(COOKIE_PATH)

    let _cookies = ''
    cookies.map(item => _cookies += `${item.name}=${item.value};`)

    request.post('https://refund2.tmall.com/dispute/adjust/adjustApply.json', {
      form: data,
      headers: {
        'origin': 'https://buyertrade.taobao.com',
        'referer':'https://buyertrade.taobao.com/trade/itemlist/list_bought_items.htm',
        'user-agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_0) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/77.0.3865.120 Safari/537.36',
        'cookie': _cookies
      },
      encoding: 'binary'
    }, (err, response, body) => {
      if (err) {
        reject(err)
        return
      }
      // body = JSON.parse(iconv.decode(body, 'GBK'))
      resolve(body)
    })
  })
}

const refundOrderPage = (id, driver) => {
  return new Promise(async (resolve, reject) => {
    try {
      await driver.get(`https://refund2.tmall.com/dispute/apply.htm?bizOrderId=${id}&type=1`)
      await driver.wait(until.elementLocated(By.className('selected-wrap')), 10000)

      // const scripts = `
      // document.getElementsByClassName('arrow-down')[0].click();
      // // document.getElementsByClassName('options-item')[0].click();
      // // document.getElementsByClassName('center button-item highlight')[0].click();
      // `
      await driver.executeScript(`document.getElementsByClassName('arrow-down')[0].click()`)
      await driver.executeScript(`document.getElementsByClassName('options-item')[0].click()`)
      await driver.executeScript(`setTimeout(function () {document.getElementsByClassName('center button-item highlight')[0].click()}, 1500)`)

      await driver.wait(until.elementLocated(By.id('disputeDetailfullButtonContainer_42')), 30000)

      resolve(id)
      // select.click()
      // return Promise.resolve()
    } catch (error) {
      reject(id)
    }
  })
}

const start = async () => {
  const params = await inquirer
  .prompt([
    {
      type: 'input',
      message: '设置筛选的前多少条订单:',
      name: 'pageSize',
      default: 100
    }
  ])

  const driver = await seleniumDriver()

  // if (! await cookieExists()) {
  await login(driver)
  // 解析登陆二维码转码
  const qrStr = await qrDecode('./qr.png')
  // console.log(qrStr)
  qrCode.generate(qrStr, { small: true })

  await driver.wait(until.elementLocated(By.className('site-nav-user')), 30000)
  await saveCookies(driver)
  // }

  const lists = await readOrderLists(params.pageSize)

  let refundOrder = []

  for (let item of lists.mainOrders) {
    if (item.extra.tradeStatus === 'WAIT_SELLER_SEND_GOODS' && item.subOrders[0].operations[0].text === '退款/退货') refundOrder.push({
      id: item.id,
      actualFee: item.payInfo.actualFee
    })
  }

  // console.log(refundOrder)

  for (let item of refundOrder) {
    try {
      await refundOrderPage(item.id, driver)
      console.log(`${item.id} 退款完成`.green)
    } catch (error) {
      console.log(`${item.id} 退款失败`.red)
    }
  }
  
  // console.log(await getLists(driver))

  // driver.quit()
}

start()