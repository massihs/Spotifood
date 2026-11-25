/**
 * The help center's first articles, written from the dashboard as it is. Inserted once, when
 * the table is empty; the team then edits them in /admin/help.
 */
export type StarterArticle = {
  slug: string;
  audience: "restaurant" | "guest";
  keywords: string;
  fa: { title: string; body: string };
  en: { title: string; body: string };
};

export const STARTER_ARTICLES: StarterArticle[] = [
  {
    slug: "print-table-qr",
    audience: "restaurant",
    keywords: "qr کیوآر کیو آر چاپ میز برچسب print table code",
    fa: {
      title: "چاپ کد QR میزها",
      body: "۱. از منوی کناری «میزها و QR» را باز کنید.\n۲. اگر میزی ندارید، با «افزودن میز» میزها را بسازید.\n۳. دکمهٔ چاپ را بزنید تا برگهٔ کدهای همهٔ میزها آماده شود و آن را چاپ کنید.\n\nهر میز کد مخصوص خودش را دارد: مشتری با دوربین گوشی کد را اسکن می‌کند و منو در مرورگر باز می‌شود، بدون نصب برنامه.",
    },
    en: {
      title: "Print the table QR codes",
      body: "1. Open “Tables & QR” in the side menu.\n2. If you have no tables yet, create them with “Add table”.\n3. Press print to get the sheet with every table's code, and print it.\n\nEach table has its own code: guests scan it with their phone camera and the menu opens in the browser, with no app to install.",
    },
  },
  {
    slug: "accept-orders",
    audience: "restaurant",
    keywords: "سفارش جدید پذیرش هشدار صدا زنگ accept new order alert sound",
    fa: {
      title: "پذیرش سفارش‌های جدید",
      body: "وقتی مشتری سفارش می‌دهد، در هر صفحه‌ای از داشبورد یک هشدار با صدا ظاهر می‌شود. دکمهٔ «پذیرش» داخل همان هشدار سفارش را به آشپزخانه می‌فرستد.\n\nهشدار تا وقتی کسی سفارش را نپذیرد باقی می‌ماند و تا سفارشی منتظر است، صدا هر دقیقه تکرار می‌شود.\n\nاگر صدا نمی‌آید: روی آیکون زنگ بالای صفحه بزنید تا هشدارها روشن شوند (مرورگر فقط پس از یک لمس اجازهٔ پخش صدا می‌دهد).",
    },
    en: {
      title: "Accepting new orders",
      body: "When a guest orders, an alert with a sound appears on every dashboard page. The “Accept” button inside the alert sends the order to the kitchen.\n\nThe alert stays until someone accepts the order, and the sound comes back every minute while orders are waiting.\n\nNo sound? Tap the bell icon at the top to turn alerts on (browsers only play sound after a tap).",
    },
  },
  {
    slug: "kitchen-screen",
    audience: "restaurant",
    keywords: "آشپزخانه صفحه نمایش تبلت حالت آشپزخانه kitchen screen kds tablet",
    fa: {
      title: "صفحهٔ آشپزخانه روی تبلت",
      body: "صفحهٔ «آشپزخانه» را روی تبلت آشپزخانه باز کنید و «حالت آشپزخانه» را بزنید تا تمام صفحه شود.\n\n• ستون‌ها: در صف، در حال آماده‌سازی، آماده.\n• با زدن روی هر غذا آن را تیک بزنید.\n• نوار «برای پخت» جمع هر غذا را نشان می‌دهد.\n• اگر اشتباهی دکمه‌ای زدید، تا ۵ ثانیه «برگرداندن» را بزنید.\n• دکمهٔ متن بزرگ‌تر برای دیدن از دور است.",
    },
    en: {
      title: "The kitchen screen on a tablet",
      body: "Open “Kitchen” on the kitchen tablet and press “Kitchen mode” to fill the screen.\n\n• Columns: to start, cooking, ready.\n• Tap a dish to tick it off.\n• The “To cook” bar adds up each dish to make.\n• Tapped a button by mistake? Press “Undo” within 5 seconds.\n• The bigger-text button helps when the screen is read from afar.",
    },
  },
  {
    slug: "kitchen-stations",
    audience: "restaurant",
    keywords: "ایستگاه بار آشپزخانه تقسیم دسته station bar routing",
    fa: {
      title: "تقسیم سفارش بین آشپزخانه و بار",
      body: "در صفحهٔ «آشپزخانه» دکمهٔ «ایستگاه‌ها» را بزنید و برای هر ایستگاه (مثلاً بار، کباب) دسته‌های منو را انتخاب کنید.\n\nهر ایستگاه فقط غذاهای خودش را می‌بیند و بخش خودش را جلو می‌برد. وقتی یک ایستگاه زودتر تمام کند، گارسون‌ها خبردار می‌شوند؛ سفارش وقتی «آماده» می‌شود که همهٔ ایستگاه‌ها تمام کرده باشند.\n\n«ایستگاه پیش‌فرض» غذاهای دسته‌هایی را می‌گیرد که به هیچ ایستگاهی وصل نیستند.",
    },
    en: {
      title: "Splitting orders between kitchen and bar",
      body: "On “Kitchen”, press “Stations” and choose the menu categories of each station (bar, grill…).\n\nEach station sees only its dishes and moves its own part forward. When a station finishes first, the waiters are told; the order becomes “ready” once every station is done.\n\nThe “default station” takes the dishes of categories no station prepares.",
    },
  },
  {
    slug: "sold-out",
    audience: "restaurant",
    keywords: "تمام شد ناموجود موجود غذا sold out unavailable dish",
    fa: {
      title: "ناموجود کردن یک غذا",
      body: "در صفحهٔ «منو»، کنار هر غذا برچسب «موجود» را بزنید تا «تمام شد» شود. مشتری‌ها دیگر نمی‌توانند آن را سفارش دهند. برای برگرداندن، دوباره روی آن بزنید.\n\nدکمهٔ «ناموجودها» بالای منو همهٔ غذاهای تمام‌شده را یک‌جا نشان می‌دهد.",
    },
    en: {
      title: "Marking a dish sold out",
      body: "On “Menu”, tap the “Available” label next to a dish to switch it to “Sold out”: guests can no longer order it. Tap again to bring it back.\n\nThe “Sold out” button above the menu lists every sold-out dish at once.",
    },
  },
  {
    slug: "import-menu",
    audience: "restaurant",
    keywords: "اکسل csv ورود منو اسنپ فود import excel snappfood menu",
    fa: {
      title: "ورود منو از اکسل یا اسنپ‌فود",
      body: "در صفحهٔ «منو»، «ورود از اکسل/CSV» را بزنید.\n\n• فایل اکسل یا CSV با ستون‌های دسته، نام، قیمت و توضیح، یا\n• لینک صفحهٔ رستوران خود در اسنپ‌فود.\n\nقبل از ثبت، پیش‌نمایش نشان داده می‌شود و تا تأیید نکنید چیزی ساخته نمی‌شود.",
    },
    en: {
      title: "Importing the menu from Excel or Snappfood",
      body: "On “Menu”, press “Import from Excel/CSV”.\n\n• An Excel or CSV file with category, name, price and description columns, or\n• the link of your restaurant's Snappfood page.\n\nYou see a preview first; nothing is created until you confirm.",
    },
  },
  {
    slug: "cash-register",
    audience: "restaurant",
    keywords: "صندوق باز کردن بستن شیفت نقد شمارش cash register drawer shift",
    fa: {
      title: "باز و بسته کردن صندوق",
      body: "در صفحهٔ «صندوق»، «باز کردن صندوق» را بزنید و موجودی اولیه را وارد کنید. آخر شیفت صندوق را ببندید و پول شمرده‌شده را وارد کنید؛ اختلاف با مبلغ مورد انتظار نشان داده می‌شود.\n\nفروش نقدی وقتی صندوق بسته است هم ثبت می‌شود، اما در هیچ شمارش صندوقی حساب نمی‌شود؛ برای کنترل نقدینگی صندوق را باز نگه دارید.",
    },
    en: {
      title: "Opening and closing the cash register",
      body: "On “Till”, press “Open register” and enter the starting float. At the end of the shift, close it and enter the cash counted; the difference with the expected amount is shown.\n\nCash sales made while the register is closed are recorded, but not included in any drawer count: keep it open to track the cash.",
    },
  },
  {
    slug: "online-pause",
    audience: "restaurant",
    keywords: "سفارش آنلاین توقف شلوغ بستن online ordering pause busy",
    fa: {
      title: "توقف موقت سفارش آنلاین در شلوغی",
      body: "بالای «نمای کلی» یا «سفارش‌ها» دکمهٔ «سفارش آنلاین: باز» را بزنید و مدت توقف را انتخاب کنید.\n\nدر این مدت سفارش آنلاین تازه پذیرفته نمی‌شود؛ منو دیده می‌شود و میزها، صندوق و کیوسک ادامه می‌دهند. پس از آن زمان، سفارش آنلاین خودکار باز می‌شود.",
    },
    en: {
      title: "Pausing online orders when busy",
      body: "At the top of “Overview” or “Orders”, press “Online ordering: open” and choose how long to pause.\n\nMeanwhile no new online order comes in; the menu stays visible and tables, till and kiosk keep working. Online ordering reopens by itself afterwards.",
    },
  },
  {
    slug: "online-payment",
    audience: "restaurant",
    keywords: "زرین پال درگاه پرداخت آنلاین مرچنت zarinpal payment gateway merchant",
    fa: {
      title: "فعال کردن پرداخت آنلاین (زرین‌پال)",
      body: "در «تنظیمات» بخش «پرداخت‌ها» را باز کنید و شناسهٔ درگاه (مرچنت) زرین‌پال خود را وارد کنید. پول مستقیم به حساب خود رستوران واریز می‌شود.\n\nپس از ذخیره، مشتری‌ها می‌توانند سر میز یا در سفارش آنلاین پرداخت کنند.",
    },
    en: {
      title: "Turning on online payment (Zarinpal)",
      body: "In “Settings”, open “Payments” and enter your Zarinpal merchant ID. The money goes straight to the restaurant's own account.\n\nOnce saved, guests can pay at the table or with online orders.",
    },
  },
  {
    slug: "kiosk",
    audience: "restaurant",
    keywords: "کیوسک سلف سرویس تبلت پیشخوان kiosk self service tablet counter",
    fa: {
      title: "راه‌اندازی کیوسک سفارش (سلف‌سرویس)",
      body: "در «تنظیمات» بخش کیوسک را فعال کنید و لینک کیوسک را روی تبلت پیشخوان باز کنید.\n\nمشتری «همین‌جا» یا «بیرون‌بر» را انتخاب می‌کند، غذا برمی‌دارد و شمارهٔ سفارشش را بزرگ می‌بیند. اگر کسی دو دقیقه به کیوسک دست نزند، کیوسک به صفحهٔ اول برمی‌گردد و سبد خالی می‌شود.\n\nلینک کیوسک را فقط روی دستگاه خود رستوران باز کنید.",
    },
    en: {
      title: "Setting up the ordering kiosk",
      body: "In “Settings”, turn the kiosk on and open the kiosk link on the counter tablet.\n\nGuests choose “Eat in” or “Take away”, pick their dishes and see their order number in large type. If nobody touches the kiosk for two minutes, it goes back to the welcome screen with an empty cart.\n\nOpen the kiosk link only on the restaurant's own device.",
    },
  },
  {
    slug: "team",
    audience: "restaurant",
    keywords: "تیم کارمند گارسون دسترسی نقش اضافه کردن team staff waiter access role",
    fa: {
      title: "اضافه کردن همکاران و دسترسی‌ها",
      body: "از منوی کناری «تیم» را باز کنید و با «افزودن عضو» همکار را با ایمیلش اضافه کنید.\n\nبرای هر نفر شغل (گارسون، صندوق‌دار، آشپزخانه، بار، مدیر…) را انتخاب کنید؛ هر شغل فقط صفحه‌های لازم را می‌بیند. می‌توانید صفحه‌ها را برای هر نفر کم یا زیاد کنید.",
    },
    en: {
      title: "Adding colleagues and their access",
      body: "Open “Team” in the side menu and add a colleague by email with “Add member”.\n\nChoose each person's job (waiter, cashier, kitchen, bar, manager…); each job sees only the pages it needs. You can add or remove pages per person.",
    },
  },
  {
    slug: "reports",
    audience: "restaurant",
    keywords: "گزارش فروش خروجی اکسل حسابداری report sales export csv",
    fa: {
      title: "گزارش فروش و خروجی اکسل",
      body: "صفحهٔ «گزارش و حسابداری» فروش، میانگین فاکتور، سود و پرفروش‌ها را برای امروز، ۷ روز، ۳۰ روز یا بازهٔ دلخواه نشان می‌دهد.\n\nبا «خروجی اکسل (CSV)» داده‌ها را برای حسابدار دانلود کنید.",
    },
    en: {
      title: "Sales reports and Excel export",
      body: "“Reports & accounting” shows sales, average ticket, profit and best sellers for today, 7 days, 30 days or any range.\n\n“Excel export (CSV)” downloads the data for your accountant.",
    },
  },
  {
    slug: "guest-order",
    audience: "guest",
    keywords: "سفارش سر میز اسکن منو چطور سفارش بدهم how to order table scan",
    fa: {
      title: "چطور سر میز سفارش بدهم؟",
      body: "۱. کد QR روی میز را با دوربین گوشی اسکن کنید؛ منو در مرورگر باز می‌شود.\n۲. با «افزودن» غذاها را به سبد اضافه کنید.\n۳. «مشاهدهٔ سبد من» و سپس «ثبت سفارش» را بزنید.\n\nوضعیت سفارش (ثبت شد، در حال پخت، آماده) را در «سفارش‌های من» می‌بینید.",
    },
    en: {
      title: "How do I order at my table?",
      body: "1. Scan the QR code on the table with your phone camera: the menu opens in the browser.\n2. Add dishes to your cart with “Add”.\n3. Open your cart and press “Place order”.\n\nFollow your order (received, cooking, ready) in “My orders”.",
    },
  },
  {
    slug: "guest-pay",
    audience: "guest",
    keywords: "پرداخت صورتحساب کارت نقد pay bill card cash",
    fa: {
      title: "چطور پرداخت کنم؟",
      body: "در «سفارش‌های من» بخش پرداخت را باز کنید: اگر رستوران پرداخت آنلاین را فعال کرده باشد، همان‌جا با کارت پرداخت می‌کنید؛ در غیر این صورت با زدن روی پرداخت سر میز، گارسون برای دریافت وجه می‌آید.",
    },
    en: {
      title: "How do I pay?",
      body: "In “My orders”, open the payment section: if the restaurant takes online payment, pay right there by card; otherwise ask to pay at the table and a waiter comes to take payment.",
    },
  },
  {
    slug: "guest-waiter",
    audience: "guest",
    keywords: "گارسون صدا زدن آب صورتحساب call waiter water bill",
    fa: {
      title: "صدا زدن گارسون",
      body: "بالای منو دکمهٔ «گارسون» را بزنید و درخواست خود (گارسون، آب، صورتحساب…) را انتخاب کنید. درخواست فوراً روی صفحهٔ کارکنان رستوران نمایش داده می‌شود.",
    },
    en: {
      title: "Calling a waiter",
      body: "Press the “Waiter” button at the top of the menu and choose what you need (waiter, water, the bill…). It shows up at once on the restaurant staff's screens.",
    },
  },
];
