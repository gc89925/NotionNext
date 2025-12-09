export default async function handler(req, res) {
  try {
    const response = await fetch('http://nat.laogaofenxiang.com:5000/nat');
    const data = await response.json();
    res.status(200).json(data);
  } catch (err) {
    res.status(500).json({ success: false, message: '无法连接 VPS API' });
  }
}
