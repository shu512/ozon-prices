const { getPriceFromText } = require('./utils');
const { loadToDbPrices, loadToDbNotExistedProducts } = require('./utils/db');
const { ProductStatuses } = require('./utils/product_statuses');
const { XPaths } = require('./utils/xpaths');
const { Builder, Browser, By, ThenableWebDriver, WebElement } = require('selenium-webdriver');
const chrome = require('selenium-webdriver/chrome');

const LIMIT_TRIES = 20;
const LIMIT_BATCH = 10000;

const ozonBlockId = 'reload-button';

/**
 * @async
 * @param {ThenableWebDriver} driver 
 * @param {number[]} ids
 * @returns { Promise<{ price: number, productId: number } | null> }
 */
async function runSearch(ids) {
  const options = new chrome.Options()
    .addArguments('--headless=new')
    .addArguments('user-agent=Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/74.0.3729.169 Safari/537.36');

  let priceInfos = [];
  let skipProducts = [];
  let driver;
  let priceInfo;

  driver = new Builder()
      .forBrowser(Browser.CHROME)
      .setChromeOptions(options)
      .build();
  await setupCookies(driver);
  
  for (let id of ids) {
    try {
      priceInfo = await processPageElement(driver, id);
      if (priceInfo?.price) priceInfos.push(priceInfo);
      if (priceInfo?.reason) skipProducts.push(priceInfo);

      if (priceInfos.length >= LIMIT_BATCH) {
        await loadToDbPrices(priceInfos);
        priceInfos = [];
      }
      if (skipProducts.length >= LIMIT_BATCH) {
        await loadToDbNotExistedProducts(skipProducts);
        skipProducts = [];
      }
    }
    catch {}
  }
  await driver.quit();

  await loadToDbPrices(priceInfos);
  await loadToDbNotExistedProducts(skipProducts);
  priceInfos = [];
}

/**
 * @async
 * @param {ThenableWebDriver} driver 
 */
async function setupCookies(driver) {
  await driver.get(`https://www.ozon.ru`);
  await driver.manage().addCookie({ name: 'is_adult_confirmed', value: 'true' });
  await driver.manage().addCookie({ name: 'adult_user_birthdate', value: '2001-11-11' });  
}


/**
 * @async
 * @param {ThenableWebDriver} driver 
 * @param {number} id 
 * @returns { Promise<{ price: number, productId: number } | null> }
 */
async function processPageElement(driver, id) {
  /**
  *  @type {{elem: WebElement, status: ProductStatuses } | null}
  */
  let res;
  await driver.get(`https://www.ozon.ru/product/${id}`);
  try {
    res = await driver.wait(
      awaitPrice(driver),
      2000
    );
  } catch {}
  if (res?.status === ProductStatuses.PRICE) {
    const price = getPriceFromText(await res.elem.getText());
    return {
      price,  
      productId: id,
    };
  }

  if (
    res?.status === ProductStatuses.NOT_EXIST ||
    res?.status === ProductStatuses.OUT_OF_STOCK ||
    res?.status === ProductStatuses.NOT_DELIVERY
  ) {
      return {
        reason: res?.status,  
        productId: id,
      };
  }
  return null;
}

/**
 * returns async function that awaits until the text (price; out of stock; cannot be delivered; not exist, etc) appears
 * @param {ThenableWebDriver} driver 
 * @returns {() => Promise<WebElement | null>}
 */
function awaitPrice(driver) {
  return async () => {
    let elem;
    let i = 0;
    while(true) {
      elem = await driver.findElements(By.xpath(XPaths.price.xpath));
      if (elem.length > 0) return { elem: elem[0], status: XPaths.price.status };
  
      elem = await driver.findElements(By.xpath(XPaths.outOfStock.xpath));
      if (elem.length > 0) return { elem: elem[0], status: XPaths.outOfStock.status };

      elem = await driver.findElements(By.xpath(XPaths.notDelivery.xpath));
      if (elem.length > 0) return { elem: elem[0], status: XPaths.notDelivery.status };

      elem = await driver.findElements(By.xpath(XPaths.notExist.xpath));
      if (elem.length > 0) return { elem: elem[0], status: XPaths.notExist.status };

      elem = await driver.findElements(By.id(ozonBlockId));
      if (elem.length > 0) {
        await driver.navigate().refresh();
      }
  
      i++;
      if (i >= LIMIT_TRIES) {
        return null;
      }
      await driver.sleep(100);
    }
  };
}

module.exports = {
  runSearch,
}