exports.handler = async (event, context) => {
  if (event.httpMethod !== 'POST') {
    return { statusCode: 405, body: 'Method Not Allowed' };
  }

  const data = JSON.parse(event.body);
  const { name, surname, telegram, phone, items } = data;

  // 🔧 Убедись, что эти данные верные!
  const GITHUB_TOKEN = process.env.GITHUB_TOKEN;
  const OWNER = 'HouseholderLife'; // Твой ник на GitHub
  const REPO = 'householderShop';  // Название репозитория
  const FORMSPREE_ENDPOINT = 'https://formspree.io/f/maqaayzq';

  try {
    // 1. Получаем текущий products.json из GitHub
    const getFileRes = await fetch(
      `https://api.github.com/repos/${OWNER}/${REPO}/contents/products.json`,
      {
        headers: {
          'Authorization': `token ${GITHUB_TOKEN}`,
          'Accept': 'application/vnd.github.v3+json'
        }
      }
    );
    const fileData = await getFileRes.json();
    const content = Buffer.from(fileData.content, 'base64').toString('utf-8');
    let products = JSON.parse(content);

    // 2. Уменьшаем остатки
    const updatedProducts = products.map(product => {
      const cartItem = items.find(item => item.id === product.id);
      if (cartItem) {
        return { ...product, stock: Math.max(0, product.stock - cartItem.qty) };
      }
      return product;
    });

    // 3. Отправляем обновлённый файл обратно в GitHub
    const updateFileRes = await fetch(
      `https://api.github.com/repos/${OWNER}/${REPO}/contents/products.json`,
      {
        method: 'PUT',
        headers: {
          'Authorization': `token ${GITHUB_TOKEN}`,
          'Accept': 'application/vnd.github.v3+json',
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          message: `🛒 Заказ: ${name} - обновление остатков`,
          content: Buffer.from(JSON.stringify(updatedProducts, null, 2)).toString('base64'),
          sha: fileData.sha
        })
      }
    );

    if (!updateFileRes.ok) throw new Error('Failed to update products.json');

    // 4. Отправляем письмо через Formspree
    let orderText = `🛒 НОВЫЙ ЗАКАЗ\n\n👤 Имя: ${name}\n`;
    if (surname) orderText += `Фамилия: ${surname}\n`;
    if (telegram) orderText += `✈️ Telegram: ${telegram}\n`;
    if (phone) orderText += `📞 Телефон: ${phone}\n`;
    orderText += `\n📦 ТОВАРЫ:\n`;

    let total = 0;
    items.forEach(item => {
      const sum = item.price * item.qty;
      total += sum;
      orderText += `• ${item.name} × ${item.qty} = ${sum} ₽\n`;
    });
    orderText += `\n💰 ИТОГО: ${total} ₽`;

    await fetch(FORMSPREE_ENDPOINT, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        name, surname, telegram, phone,
        message: orderText,
        _captcha: 'false',
        _template: 'raw'
      })
    });

    // 5. Успех
    return {
      statusCode: 200,
      body: JSON.stringify({ success: true, message: 'Order processed' })
    };

  } catch (error) {
    console.error('Function Error:', error);
    return {
      statusCode: 500,
      body: JSON.stringify({ success: false, error: error.message })
    };
  }
};
