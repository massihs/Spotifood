import { asciiDigits } from "./phone";
import { tidy, type Nutrition } from "./nutrition";

/**
 * Rough nutrition estimate of a dish from its ingredient list (Persian, French or English),
 * using average values per 100 g (USDA / CIQUAL order of magnitude). The restaurant checks
 * and corrects it: it is a starting point, never a lab analysis.
 *
 * Each row: keywords | kcal, protein, carbs, sugar, fat, fiber, salt (per 100 g) | grams in a
 * typical portion of a dish, used when the text gives no quantity.
 */
type Row = [
  keywords: string,
  per100: [number, number, number, number, number, number, number],
  portionG: number,
];

const TABLE: Row[] = [
  ["برنج|پلو|چلو|riz|rice", [130, 2.7, 28, 0.1, 0.3, 0.4, 0], 250],
  [
    "نان|لواش|سنگک|بربری|تافتون|نان تست|pain|baguette|bread|pita|tortilla|croûtons|croutons|toast",
    [265, 9, 49, 5, 3.2, 2.7, 1.2],
    80,
  ],
  ["نان همبرگر|نان باگت|bun|pain burger|brioche", [285, 9, 50, 7, 5, 2, 1.1], 70],
  [
    "پاستا|ماکارونی|اسپاگتی|پنه|لازانیا|pâtes|pates|spaghetti|penne|tagliatelle|lasagne|pasta|macaroni",
    [158, 5.8, 31, 0.6, 0.9, 1.8, 0],
    220,
  ],
  ["خمیر پیتزا|پیتزا|خمیر|pâte|pâte à pizza|pizza|pizza dough|dough", [250, 8, 48, 2, 3, 2, 1.2], 150],
  [
    "سیب زمینی سرخ کرده|سیب زمینی سرخ|فرنچ فرایز|frites|fries|french fries",
    [312, 3.4, 41, 0.3, 15, 3.8, 0.6],
    120,
  ],
  ["سیب زمینی|pomme de terre|pommes de terre|potato|potatoes|purée", [87, 1.9, 20, 0.9, 0.1, 1.8, 0], 150],
  [
    "گوشت|گوشت گاو|گوساله|راسته|فیله|استیک|بیف|bœuf|boeuf|veau|steak|beef|veal|entrecôte",
    [250, 26, 0, 0, 15, 0, 0.15],
    150,
  ],
  ["گوسفند|بره|گوشت گوسفندی|ماهیچه|agneau|mouton|lamb|mutton", [294, 25, 0, 0, 21, 0, 0.18], 150],
  [
    "کوبیده|کباب|چرخ کرده|گوشت چرخ کرده|همبرگر|کتلت|haché|viande hachée|steak haché|kebab|kofta|minced|ground beef|patty|burger",
    [270, 25, 2, 0.5, 18, 0, 0.5],
    100,
  ],
  [
    "مرغ|جوجه|جوجه کباب|سینه مرغ|ران مرغ|poulet|blanc de poulet|chicken|chicken breast",
    [165, 31, 0, 0, 3.6, 0, 0.2],
    150,
  ],
  [
    "مرغ سوخاری|ناگت|سوخاری|nuggets|poulet frit|fried chicken|crispy chicken",
    [270, 16, 15, 0.5, 16, 0.8, 1.1],
    150,
  ],
  ["ماهی|ماهی قزل آلا|قزل آلا|poisson|fish|cabillaud|cod", [140, 22, 0, 0, 5, 0, 0.2], 150],
  ["سالمون|سالمن|saumon|salmon", [208, 20, 0, 0, 13, 0, 0.15], 150],
  ["میگو|crevette|crevettes|shrimp|prawn|prawns", [99, 24, 0.2, 0, 0.3, 0, 0.6], 120],
  ["تن ماهی|thon|tuna", [130, 28, 0, 0, 1, 0, 0.9], 80],
  ["سوسیس|کالباس|پپرونی|salami|saucisse|chorizo|sausage|pepperoni|hot dog", [300, 12, 2, 1, 27, 0, 2.2], 60],
  ["ژامبون|jambon|ham", [145, 21, 1.5, 1, 6, 0, 2.5], 40],
  ["بیکن|bacon|lardons", [540, 37, 1.4, 0, 42, 0, 2.6], 30],
  ["تخم مرغ|نیمرو|املت|œuf|oeuf|œufs|oeufs|omelette|egg|eggs", [155, 13, 1.1, 1.1, 11, 0, 0.3], 100],
  [
    "پنیر|پنیر گودا|پنیر چدار|چدار|گودا|fromage|cheddar|emmental|gouda|cheese",
    [380, 25, 1.3, 0.5, 30, 0, 1.6],
    40,
  ],
  ["موزارلا|پنیر پیتزا|mozzarella", [280, 22, 2.2, 1, 20, 0, 1], 80],
  ["فتا|پنیر سفید|پنیر فتا|feta", [264, 14, 4, 4, 21, 0, 2.8], 40],
  ["پارمزان|parmesan|parmigiano", [431, 38, 4, 0.9, 29, 0, 1.6], 15],
  ["خامه|crème|creme|crème fraîche|cream", [340, 2.1, 2.8, 2.9, 36, 0, 0.08], 40],
  ["شیر|lait|milk", [61, 3.2, 4.8, 5, 3.3, 0, 0.1], 200],
  ["ماست|yaourt|yogourt|yogurt|yoghurt", [61, 3.5, 4.7, 4.7, 3.3, 0, 0.1], 100],
  ["کره|beurre|butter", [717, 0.9, 0.1, 0.1, 81, 0, 0.6], 10],
  ["روغن|روغن زیتون|روغن مایع|huile|huile d'olive|oil|olive oil", [884, 0, 0, 0, 100, 0, 0], 10],
  ["سس مایونز|مایونز|سس سفید|mayonnaise|mayo|sauce blanche", [680, 1, 0.6, 0.6, 75, 0, 1.5], 20],
  ["کچاپ|ketchup", [112, 1.7, 26, 22, 0.1, 0.3, 2.3], 20],
  ["سس گوجه|سس گوجه فرنگی|رب|رب گوجه|sauce tomate|tomato sauce|marinara", [50, 1.6, 8, 5, 1.5, 1.8, 1], 60],
  ["سس|sauce", [150, 1.5, 12, 8, 10, 0.5, 1.5], 30],
  ["گوجه|گوجه فرنگی|tomate|tomates|tomato|tomatoes", [18, 0.9, 3.9, 2.6, 0.2, 1.2, 0], 60],
  ["پیاز|پیاز داغ|oignon|oignons|onion|onions", [40, 1.1, 9.3, 4.2, 0.1, 1.7, 0], 30],
  ["سیر|ail|garlic", [149, 6.4, 33, 1, 0.5, 2.1, 0], 5],
  [
    "کاهو|کاهو پیچ|روکولا|salade|laitue|roquette|lettuce|arugula|rocket",
    [15, 1.4, 2.9, 0.8, 0.2, 1.3, 0],
    40,
  ],
  ["خیار|concombre|cucumber", [15, 0.7, 3.6, 1.7, 0.1, 0.5, 0], 50],
  ["فلفل دلمه|فلفل دلمه ای|poivron|bell pepper|pepper", [31, 1, 6, 4.2, 0.3, 2.1, 0], 40],
  ["قارچ|champignon|champignons|mushroom|mushrooms", [22, 3.1, 3.3, 2, 0.3, 1, 0], 50],
  ["هویج|carotte|carottes|carrot|carrots", [41, 0.9, 9.6, 4.7, 0.2, 2.8, 0.1], 40],
  ["بادمجان|aubergine|eggplant", [35, 0.8, 8.7, 3.2, 0.2, 2.5, 0], 150],
  ["کدو|کدو سبز|courgette|zucchini", [17, 1.2, 3.1, 2.5, 0.3, 1, 0], 100],
  ["اسفناج|épinard|épinards|epinards|spinach", [23, 2.9, 3.6, 0.4, 0.4, 2.2, 0.2], 60],
  [
    "سبزی|سبزی خوردن|جعفری|گشنیز|شوید|نعناع|ریحان|تره|herbes|persil|coriandre|menthe|basilic|herbs|parsley|coriander|mint|basil|dill",
    [36, 3, 6, 0.9, 0.8, 3.3, 0.1],
    30,
  ],
  ["سبزیجات|سالاد|légumes|legumes|crudités|vegetables|veggies|salad", [40, 2, 7, 3, 0.3, 3, 0.1], 100],
  ["ذرت|maïs|mais|corn", [96, 3.4, 21, 4.5, 1.5, 2.4, 0], 50],
  ["نخود فرنگی|petits pois|peas", [81, 5.4, 14, 5.7, 0.4, 5.1, 0], 50],
  [
    "نخود|حمص|pois chiche|pois chiches|houmous|hummus|chickpea|chickpeas",
    [164, 8.9, 27, 4.8, 2.6, 7.6, 0],
    60,
  ],
  ["عدس|عدسی|lentille|lentilles|lentil|lentils", [116, 9, 20, 1.8, 0.4, 7.9, 0], 80],
  ["لوبیا|لوبیا قرمز|لوبیا چیتی|haricot|haricots|bean|beans", [127, 8.7, 23, 0.3, 0.5, 6.4, 0], 80],
  ["لپه|split peas", [118, 8.3, 21, 2.9, 0.4, 8.3, 0], 40],
  ["زیتون|olive|olives", [115, 0.8, 6, 0, 11, 3.2, 2.2], 20],
  ["آووکادو|اووکادو|avocat|avocado", [160, 2, 8.5, 0.7, 14.7, 6.7, 0], 50],
  ["گردو|noix|walnut|walnuts", [654, 15, 14, 2.6, 65, 6.7, 0], 15],
  ["بادام|amande|amandes|almond|almonds", [579, 21, 22, 4.4, 50, 12.5, 0], 15],
  ["پسته|pistache|pistaches|pistachio|pistachios", [560, 20, 28, 7.7, 45, 10.6, 0], 15],
  ["بادام زمینی|cacahuète|cacahuètes|peanut|peanuts", [567, 26, 16, 4.7, 49, 8.5, 0], 15],
  ["کنجد|ارده|sésame|sesame|tahini|tahin", [573, 18, 23, 0.3, 50, 12, 0], 10],
  ["نارگیل|noix de coco|coco|coconut", [354, 3.3, 15, 6, 33, 9, 0], 20],
  ["شکر|قند|sucre|sugar", [387, 0, 100, 100, 0, 0, 0], 10],
  ["عسل|miel|honey", [304, 0.3, 82, 82, 0, 0.2, 0], 20],
  ["شکلات|نوتلا|کاکائو|chocolat|nutella|cacao|chocolate|cocoa", [546, 4.9, 61, 48, 31, 7, 0], 30],
  ["آرد|farine|flour", [364, 10, 76, 0.3, 1, 2.7, 0], 30],
  ["کیک|کیک شکلاتی|چیزکیک|gâteau|gateau|cheesecake|brownie|cake", [390, 5, 53, 35, 18, 1, 0.6], 100],
  [
    "شیرینی|کلوچه|بیسکویت|کوکی|biscuit|biscuits|cookie|cookies|pâtisserie|pastry|croissant",
    [450, 6, 60, 28, 21, 2, 0.8],
    60,
  ],
  ["بستنی|glace|ice cream|gelato", [207, 3.5, 24, 21, 11, 0.7, 0.2], 100],
  ["میوه|fruit|fruits", [55, 0.7, 14, 10, 0.2, 2, 0], 150],
  ["سیب|pomme|pommes|apple|apples", [52, 0.3, 14, 10, 0.2, 2.4, 0], 150],
  ["موز|banane|bananes|banana|bananas", [89, 1.1, 23, 12, 0.3, 2.6, 0], 120],
  ["توت فرنگی|fraise|fraises|strawberry|strawberries", [32, 0.7, 7.7, 4.9, 0.3, 2, 0], 100],
  ["پرتقال|orange|oranges", [47, 0.9, 12, 9, 0.1, 2.4, 0], 150],
  ["لیمو|لیمو ترش|آبلیمو|citron|lemon|lime", [29, 1.1, 9, 2.5, 0.3, 2.8, 0], 10],
  ["خرما|datte|dattes|date|dates", [282, 2.5, 75, 63, 0.4, 8, 0], 40],
  ["کشمش|raisins secs|raisin sec|raisins", [299, 3.1, 79, 59, 0.5, 3.7, 0], 20],
  ["زرشک|épine-vinette|barberry|barberries", [300, 4, 70, 40, 1, 7, 0], 10],
  ["زعفران|safran|saffron", [310, 11, 65, 0, 6, 4, 0], 0.2],
  ["قهوه|اسپرسو|کافه|café|cafe|espresso|coffee", [2, 0.1, 0, 0, 0, 0, 0], 150],
  ["چای|چای سبز|thé|the|tea", [1, 0, 0.3, 0, 0, 0, 0], 250],
  ["نوشابه|کوکا|پپسی|soda|coca|cola|limonade|lemonade", [42, 0, 10.6, 10.6, 0, 0, 0], 330],
  ["آبمیوه|آب پرتقال|آب سیب|jus|jus d'orange|juice|orange juice", [45, 0.7, 10.4, 8.4, 0.2, 0.2, 0], 250],
  ["دوغ|doogh|ayran", [25, 1.4, 2, 2, 1.2, 0, 0.4], 300],
  ["شربت|sirop|syrup", [260, 0, 65, 65, 0, 0, 0], 30],
  ["نمک|sel|salt", [0, 0, 0, 0, 0, 0, 100], 1.5],
  ["سس سویا|sauce soja|soy sauce", [53, 8, 4.9, 0.4, 0.6, 0.8, 14.5], 10],
  ["خیارشور|خیار شور|ترشی|cornichon|cornichons|pickle|pickles", [11, 0.3, 2.3, 1.1, 0.2, 1, 3], 20],
  ["کشک|kashk", [120, 15, 8, 3, 3, 0, 4], 30],
  ["رشته|رشته آش|nouilles|noodle|noodles|ramen", [138, 4.5, 25, 0.4, 2, 1.2, 0.1], 100],
  ["جو|جو دوسر|بلغور|avoine|flocons d'avoine|oat|oats|oatmeal|barley", [389, 17, 66, 1, 7, 10.6, 0], 40],
  ["توفو|tofu", [76, 8, 1.9, 0.6, 4.8, 0.3, 0], 100],
  ["فلافل|falafel", [333, 13, 32, 0, 18, 4.9, 0.7], 100],
  ["کینوا|quinoa", [120, 4.4, 21, 0.9, 1.9, 2.8, 0], 150],
  ["کوسکوس|couscous|semoule", [112, 3.8, 23, 0.1, 0.2, 1.4, 0], 150],
  ["خردل|moutarde|mustard", [66, 4.4, 5.8, 0.9, 4, 4, 2.8], 10],
  ["پستو|pesto", [418, 5, 6, 2, 42, 1.5, 2], 20],
  ["گردو و رب انار|رب انار|انار|grenade|pomegranate", [83, 1.7, 19, 14, 1.2, 4, 0], 40],
];

/** Lower case, no accents marks of the Arabic script, Arabic ي/ك → Persian, ZWNJ → space. */
export function normalizeFoodText(s: string) {
  return asciiDigits(s)
    .toLowerCase()
    .normalize("NFC")
    .replace(/[ً-ٰٟ]/g, "")
    .replace(/ي/g, "ی")
    .replace(/ك/g, "ک")
    .replace(/[‌‏‎]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

const ENTRIES = TABLE.map(([keys, per100, portionG], i) => ({
  id: i,
  keys: keys.split("|").map(normalizeFoodText),
  per100,
  portionG,
}));
const escape = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
const PLURAL = "(?:s|es|x|ها|های|ی)?";

/** The table row whose longest keyword appears as whole words in the text, and that keyword. */
function bestEntry(text: string) {
  let best: { entry: (typeof ENTRIES)[number]; key: string } | null = null;
  for (const entry of ENTRIES)
    for (const key of entry.keys) {
      if (best && key.length <= best.key.length) continue;
      if (new RegExp(`(^|[\\s'’(-])${escape(key)}${PLURAL}(?=$|[\\s,.)'’-])`, "u").test(text))
        best = { entry, key };
    }
  return best;
}

const SPLIT = /[,،؛;\n/+•·|]|\s(?:و|et|and|avec|with|با)\s/u;
const GRAMS = /(\d+(?:[.,]\d+)?)\s*(?:g|gr|grs|grammes?|grams?|گرم)(?![\p{L}])/iu;
/** "2 سیخ", "3 pièces", "x2": that many typical portions. */
const COUNT =
  /(?:(\d+)\s*(?:سیخ|عدد|تکه|تا|اسکوپ|x|pcs?|pièces?|pieces?|tranches?|slices?|boules?|scoops?)(?![\p{L}])|(?:^|\s)x\s*(\d+))/iu;

export type NutritionEstimate = {
  nutrition: Nutrition;
  /** Recognized ingredients with the grams counted for them. */
  matched: { text: string; grams: number }[];
  /** Parts of the list that were not recognized (left out of the estimate). */
  unknown: string[];
};

/**
 * Estimate for one portion. Quantities written in the list ("برنج ۲۰۰ گرم", "riz 200 g") are
 * kept; the other ingredients get a typical amount, scaled so the dish weighs `weightGrams`.
 */
export function estimateNutrition(input: {
  ingredients?: string | null;
  name?: string | null;
  weightGrams?: number | null;
}): NutritionEstimate {
  const parse = (text: string) =>
    normalizeFoodText(text)
      .split(SPLIT)
      .map((p) => p.trim())
      .filter(Boolean);
  let parts = parse(input.ingredients ?? "");
  // No ingredient list: the dish name sometimes says enough ("Chelo kabab", "Salade César").
  if (!parts.some((p) => bestEntry(p))) {
    const fromName = parse(input.name ?? "").flatMap((p) => p.split(" "));
    if (fromName.some((p) => bestEntry(p))) parts = fromName.filter((p) => bestEntry(p));
  }

  const found: { text: string; entry: (typeof ENTRIES)[number]; grams: number; fixed: boolean }[] = [];
  const unknown: string[] = [];
  for (const part of parts) {
    const hit = bestEntry(part);
    if (!hit) {
      if (part.length > 1) unknown.push(part);
      continue;
    }
    const g = GRAMS.exec(part);
    const n = COUNT.exec(part);
    const count = n ? Math.min(10, Number(n[1] ?? n[2])) || 1 : 1;
    const grams = g ? Number(g[1]!.replace(",", ".")) : hit.entry.portionG * count;
    found.push({ text: part, entry: hit.entry, grams, fixed: Boolean(g) });
  }

  const weight = input.weightGrams && input.weightGrams > 0 ? input.weightGrams : null;
  if (weight) {
    const fixed = found.filter((f) => f.fixed).reduce((s, f) => s + f.grams, 0);
    const flexible = found.filter((f) => !f.fixed).reduce((s, f) => s + f.grams, 0);
    if (flexible > 0) {
      const scale = Math.min(4, Math.max(0.25, Math.max(0, weight - fixed) / flexible));
      for (const f of found) if (!f.fixed) f.grams *= scale;
    }
  }

  const sum = [0, 0, 0, 0, 0, 0, 0];
  for (const f of found) f.entry.per100.forEach((v, i) => (sum[i]! += (v * f.grams) / 100));
  const nutrition = found.length
    ? tidy({
        kcal: sum[0],
        proteinG: sum[1],
        carbsG: sum[2],
        sugarG: sum[3],
        fatG: sum[4],
        fiberG: sum[5],
        saltG: sum[6],
      })
    : {};
  return {
    nutrition,
    matched: found.map((f) => ({ text: f.text, grams: Math.round(f.grams) })),
    unknown,
  };
}
