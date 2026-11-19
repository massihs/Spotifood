import { describe, expect, it } from "vitest";
import { isPlatformHost } from "@/lib/hosts";
import { cartParam } from "@/server/modules/channels/bot";
import { domainSchema } from "@/server/modules/channels/domain";
import { fillText } from "@/server/modules/marketing/automations";

describe("sales channels", () => {
  it("cleans a domain and refuses Spotifood's own hosts", () => {
    expect(domainSchema.parse(" https://Order.MyResto.ir/menu ")).toBe("order.myresto.ir");
    expect(domainSchema.safeParse("not a domain").success).toBe(false);
    expect(isPlatformHost("spotifood.ir")).toBe(true);
    expect(isPlatformHost("app.liara.run")).toBe(true);
    expect(isPlatformHost("localhost:3000")).toBe(true);
    expect(isPlatformHost("order.myresto.ir")).toBe(false);
  });

  it("puts the bot's basket in the ordering site's link", () => {
    expect(
      cartParam([
        { productId: "a", quantity: 2 },
        { productId: "b", quantity: 1 },
      ]),
    ).toBe("a*2,b*1");
  });

  it("fills the automatic texts and ends them with the opt-out keyword", () => {
    const text = fillText("سلام {name}، {dish} در {restaurant}: {link}", {
      name: "سارا",
      restaurant: "کافه",
      dish: "کیک",
      link: "https://x.ir",
    });
    expect(text).toBe("سلام سارا، کیک در کافه: https://x.ir\nلغو11");
    expect(fillText("Bonjour {name} !", { name: null, restaurant: "R", link: "" })).toBe(
      "Bonjour ! \nلغو11".replace(" \n", "\n"),
    );
  });
});
