# 🌾 Kisan Bazaar
Kisan seedha buyer se jude: fasal listing, mandi bhav, mausam. Node.js + Express + vanilla JS.

## Local chalane ke liye
```
npm install
npm start   # http://localhost:3000
```

## Render pe deploy
1. GitHub pe naya repo banao aur ye saari files push karo.
2. render.com -> New -> Blueprint (ya Web Service) -> repo chuno.
3. Build: `npm install`, Start: `npm start`, env var `JWT_SECRET` = koi lamba random text.
4. Deploy dabao. Live link mil jayega.

## Dhyan rakhein
- **Permanent data (MongoDB Atlas, free):** mongodb.com/atlas pe free M0 cluster banao -> Database Access me user+password banao -> Network Access me `0.0.0.0/0` allow karo (Render ka IP badalta rehta hai) -> Connect -> Drivers se connection string lo -> Render me env var `MONGODB_URI` me daalo (password ki jagah apna password). Bina `MONGODB_URI` ke app local `db.json` use karta hai, jo Render pe restart par mit jata hai.
- **Asli mandi bhav:** data.gov.in pe free account banao, "Current Daily Price of Various Commodities from Various Markets (Mandi)" ka API key lo, aur Render mein env var `DATA_GOV_KEY` me daalo. Key na ho to sample data dikhta hai. Key ko kabhi code/GitHub me mat daalo.
- Mausam Open-Meteo se aata hai (free, key nahi chahiye).

## Naye features
- **Hindi/English:** header me "EN / हिं" button.
- **Photo upload:** kisan fasal ki photo daal sakta hai. Phone se compress hoke (800px) MongoDB me save hoti hai (MONGODB_URI zaroori, warna restart pe ud jayegi).
- **OTP verification:** Render me `FAST2SMS_KEY` daalo (fast2sms.com, India SMS; OTP route ke liye unki shartein/KYC dekh lo, request body unke docs se ek baar verify karein). Key na ho to OTP band rehta hai aur register seedha hota hai. Testing ke liye `OTP_DEV=1` (OTP screen pe dikhega, production me kabhi mat rakho).
- **Orders + Ratings:** buyer "Order request" bhejta hai -> kisan accept/reject -> sauda poora hone par kisan "done" karta hai (stock apne aap kam hota hai) -> sirf tabhi buyer 1-5 rating de sakta hai (fake reviews nahi). Kisan ki average rating bazaar me dikhti hai. Number tabhi dikhta hai jab kisan order accept kare.
- **Payment:** app paisa nahi sambhalta (UPI/cash aapas me). Sachcha escrow ke liye Razorpay Route ya Cashfree jaise RBI-licensed partner + KYC chahiye, ye alag integration hai.
