/**
 * One-time import of meals from meal_planning.csv into the Meal table,
 * plus PlannedMeal entries for the "last on menu" date(s) recorded for
 * each dish.
 *
 * USAGE:
 *   node scripts/import-meals.mjs you@example.com
 *
 * The email is whichever account should own these meals (they're created
 * as "personal" — only that account will see/plan them; change
 * DEFAULT_VISIBILITY below to "public" first if you'd rather share them
 * with every account on this install).
 *
 * NOTES ON THE SOURCE DATA / MAPPING DECISIONS:
 * - The CSV had two "last on menu"-ish columns. Where the second one
 *   parsed as a date, it became a second PlannedMeal entry (some dishes
 *   were apparently served twice, or the sheet was tracking a "most
 *   recent" and an older date). Where it didn't parse as a date (e.g.
 *   "option 1", "rasp/dark chocolate", "?"), it was folded into that
 *   meal's Notes field instead, labeled "Additional note (last-on-menu
 *   column 2): ...", so nothing was silently dropped.
 * - mealType wasn't in the source data, so this script guesses: rows
 *   tagged "breakfast" get mealType "breakfast"; everything else
 *   (pizza, pasta, tortilla, sammy, bun, meat, soup, side, restaurant,
 *   etc.) defaults to "dinner". Edit PLANNED entries afterward on the
 *   board if any of those should actually be lunch.
 * - "protein" values that didn't map cleanly to the app's fixed
 *   protein-type list (e.g. "seafood", "lamb", multi-value cells like
 *   "beef, pork") were set to primaryProtein "Other", with the original
 *   raw value preserved in Notes so you can fix it up by hand later.
 * - No ingredients/instructions were in the source data, so those are
 *   left empty — the meal's Notes/Source carry over everything that was
 *   in the spreadsheet.
 *
 * SAFE TO RUN: only once per email. Re-running will create duplicate
 * meals (meal names aren't unique in the schema), and duplicate
 * PlannedMeal rows for the same date/meal type.
 */

import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();
const DEFAULT_VISIBILITY = "personal"; // or "public"

const ownerEmail = process.argv[2];
if (!ownerEmail || !ownerEmail.includes("@")) {
  console.error("Usage: node scripts/import-meals.mjs you@example.com");
  process.exit(1);
}

const rows = [
  {
    "name": "bagel",
    "tag": "breakfast",
    "primaryProtein": "None",
    "source": "",
    "notes": "",
    "fiber": 3.0,
    "plannedDates": []
  },
  {
    "name": "bee sting",
    "tag": "pizza",
    "primaryProtein": "Pork",
    "source": "",
    "notes": "",
    "fiber": 3.0,
    "plannedDates": [
      [
        "2026-05-19",
        "dinner"
      ]
    ]
  },
  {
    "name": "bee sting, CF",
    "tag": "restaurant",
    "primaryProtein": "Pork",
    "source": "",
    "notes": "half bee sting",
    "fiber": 2.5,
    "plannedDates": []
  },
  {
    "name": "brisket",
    "tag": "meat",
    "primaryProtein": "Beef",
    "source": "",
    "notes": "",
    "fiber": null,
    "plannedDates": [
      [
        "2026-05-25",
        "dinner"
      ]
    ]
  },
  {
    "name": "brisket sammies",
    "tag": "bun",
    "primaryProtein": "Beef",
    "source": "",
    "notes": "[check current bun fiber content]",
    "fiber": 11.0,
    "plannedDates": [
      [
        "2026-07-18",
        "dinner"
      ]
    ]
  },
  {
    "name": "brisket wraps L",
    "tag": "tortilla",
    "primaryProtein": "Beef",
    "source": "",
    "notes": "",
    "fiber": 19.0,
    "plannedDates": [
      [
        "2026-07-20",
        "dinner"
      ]
    ]
  },
  {
    "name": "Cancun shrimp tacos",
    "tag": "tortilla",
    "primaryProtein": "Other",
    "source": "",
    "notes": "three tacos WHERE IS TOM'S RECIPE?\nOriginal protein value from import: seafood\nFiber value in source spreadsheet was approximate: 19.5+",
    "fiber": 19.5,
    "plannedDates": [
      [
        "2026-07-24",
        "dinner"
      ]
    ]
  },
  {
    "name": "caprese pasta",
    "tag": "pasta",
    "primaryProtein": "None",
    "source": "",
    "notes": "",
    "fiber": 20.0,
    "plannedDates": [
      [
        "2026-05-29",
        "dinner"
      ]
    ]
  },
  {
    "name": "caprese sandwich on French bread",
    "tag": "sammy",
    "primaryProtein": "None",
    "source": "",
    "notes": "",
    "fiber": 2.0,
    "plannedDates": [
      [
        "2026-05-28",
        "dinner"
      ]
    ]
  },
  {
    "name": "chicken pesto on French bread",
    "tag": "sammy",
    "primaryProtein": "Chicken",
    "source": "",
    "notes": "",
    "fiber": 2.0,
    "plannedDates": [
      [
        "2026-08-13",
        "dinner"
      ],
      [
        "2026-07-23",
        "dinner"
      ]
    ]
  },
  {
    "name": "chicken shawarma wrap M",
    "tag": "tortilla",
    "primaryProtein": "Chicken",
    "source": "",
    "notes": "",
    "fiber": 17.6,
    "plannedDates": [
      [
        "2026-05-21",
        "dinner"
      ]
    ]
  },
  {
    "name": "chicken tequila fettucine",
    "tag": "pasta",
    "primaryProtein": "Chicken",
    "source": "CPK 82",
    "notes": "",
    "fiber": 21.0,
    "plannedDates": [
      [
        "2026-08-04",
        "dinner"
      ],
      [
        "2026-07-13",
        "dinner"
      ]
    ]
  },
  {
    "name": "chorizo tacos",
    "tag": "tortilla",
    "primaryProtein": "Chicken",
    "source": "",
    "notes": "chorizo recipe currently on index card in toritilla folder pocket",
    "fiber": 19.5,
    "plannedDates": [
      [
        "2026-05-20",
        "dinner"
      ]
    ]
  },
  {
    "name": "cream cheese pasta with chicken",
    "tag": "pasta",
    "primaryProtein": "Chicken",
    "source": "",
    "notes": "",
    "fiber": 20.0,
    "plannedDates": [
      [
        "2026-08-12",
        "dinner"
      ],
      [
        "2026-05-19",
        "dinner"
      ]
    ]
  },
  {
    "name": "fire-roasted meatball pizza",
    "tag": "pizza",
    "primaryProtein": "Beef",
    "source": "Epic Outdoor Pizza Oven 51",
    "notes": "",
    "fiber": 3.0,
    "plannedDates": [
      [
        "2026-05-16",
        "dinner"
      ]
    ]
  },
  {
    "name": "FW chorizo omelette",
    "tag": "restaurant",
    "primaryProtein": "None",
    "source": "",
    "notes": "",
    "fiber": 14.0,
    "plannedDates": [
      [
        "2026-05-18",
        "dinner"
      ]
    ]
  },
  {
    "name": "grilled chicken burritos L",
    "tag": "tortilla",
    "primaryProtein": "Chicken",
    "source": "Trejo's Tacos 94 & 96 & 97",
    "notes": "21.5 if use 3.5 bb vs. 5 bb",
    "fiber": 23.0,
    "plannedDates": [
      [
        "2026-05-28",
        "dinner"
      ]
    ]
  },
  {
    "name": "Hannah's enchiladas ADAPT",
    "tag": "tortilla",
    "primaryProtein": "Chicken",
    "source": "",
    "notes": "",
    "fiber": null,
    "plannedDates": []
  },
  {
    "name": "Little Bettie Yo Quiero Chorizo pizza",
    "tag": "pizza",
    "primaryProtein": "Chicken",
    "source": "Little Bettie Memphis menu description",
    "notes": "COULD SAVE FOR MEMPHIS: salsa-style red sauce, mozzarella, chorizo, bell pepper, red onion, spicy lime/cilantro crema, parm/reg, cilantro",
    "fiber": 3.0,
    "plannedDates": [
      [
        "2026-07-22",
        "dinner"
      ]
    ]
  },
  {
    "name": "mushroom pasta with cream sauce",
    "tag": "pasta",
    "primaryProtein": "None",
    "source": "",
    "notes": "TOM FIND RECIPE",
    "fiber": 23.5,
    "plannedDates": []
  },
  {
    "name": "orange chicken & orzo",
    "tag": "pasta",
    "primaryProtein": "Chicken",
    "source": "",
    "notes": "add pea pods or sugar snap peas?",
    "fiber": 20.0,
    "plannedDates": [
      [
        "2026-05-30",
        "dinner"
      ]
    ]
  },
  {
    "name": "Panera lobster bisque",
    "tag": "soup",
    "primaryProtein": "Other",
    "source": "",
    "notes": "if served w/French bread, add 2 fiber\nOriginal protein value from import: seafood",
    "fiber": null,
    "plannedDates": []
  },
  {
    "name": "pasta w/scallops and garlic cream sauce",
    "tag": "pasta",
    "primaryProtein": "Other",
    "source": "",
    "notes": "Original protein value from import: seafood",
    "fiber": 20.0,
    "plannedDates": [
      [
        "2026-05-23",
        "dinner"
      ]
    ]
  },
  {
    "name": "PB sandwich",
    "tag": "sammy",
    "primaryProtein": "None",
    "source": "",
    "notes": "",
    "fiber": 4.0,
    "plannedDates": []
  },
  {
    "name": "peanut butter toast",
    "tag": "breakfast",
    "primaryProtein": "None",
    "source": "",
    "notes": "",
    "fiber": 3.0,
    "plannedDates": []
  },
  {
    "name": "penne with zucchini, cherry tomatoes, boursin cheese",
    "tag": "pasta",
    "primaryProtein": "None",
    "source": "Pasta Revolution 199",
    "notes": "fiber/serving: zucchini 0.6, cherry tomatoes 1.5g",
    "fiber": 22.1,
    "plannedDates": [
      [
        "2026-07-22",
        "dinner"
      ]
    ]
  },
  {
    "name": "BBQ chicken pizza",
    "tag": "pizza",
    "primaryProtein": "Chicken",
    "source": "Fort Worth TX Pie Tap menu description",
    "notes": "rotisserie chicken, bourbon BBQ sauce, bacon, red onion, peppercini (hot peppers), cilantro, smoked mozzarella",
    "fiber": 3.0,
    "plannedDates": [
      [
        "2026-07-27",
        "dinner"
      ]
    ]
  },
  {
    "name": "poached eggs on rye",
    "tag": "breakfast",
    "primaryProtein": "None",
    "source": "",
    "notes": "",
    "fiber": 1.0,
    "plannedDates": []
  },
  {
    "name": "prosciutto & pine nuts",
    "tag": "pizza",
    "primaryProtein": "Pork",
    "source": "Elements of Pizza 168",
    "notes": "based on River Po",
    "fiber": 3.0,
    "plannedDates": [
      [
        "2026-05-31",
        "dinner"
      ]
    ]
  },
  {
    "name": "Slyce #17",
    "tag": "pizza",
    "primaryProtein": "Pork",
    "source": "",
    "notes": "creamy pesto | pepperoni | calabrian chili | honey 20 49\nNative to the Calabria region of Italy, these Ferrari-red chili peppers are spicy, smoky and fruity. Chefs love these mildly fermented peppers for adding brightness and heat to pizzas, grilled/roasted meat or saut\u00e9ed greens. Pro tip: save the oil for dipping crusty bread.",
    "fiber": 3.0,
    "plannedDates": []
  },
  {
    "name": "summer peach pizza",
    "tag": "pizza",
    "primaryProtein": "Pork",
    "source": "Epic Outdoor Pizza Oven 116",
    "notes": "TWEAK",
    "fiber": 3.8,
    "plannedDates": [
      [
        "2026-05-21",
        "dinner"
      ]
    ]
  },
  {
    "name": "Thai chicken pizza",
    "tag": "pizza",
    "primaryProtein": "Chicken",
    "source": "CPK 30",
    "notes": "",
    "fiber": 3.0,
    "plannedDates": [
      [
        "2026-05-29",
        "dinner"
      ]
    ]
  },
  {
    "name": "tortilla pizza M",
    "tag": "tortilla",
    "primaryProtein": "Chicken",
    "source": "",
    "notes": "D fave chicken/pretty peppers/pico/hot honey",
    "fiber": 12.0,
    "plannedDates": [
      [
        "2026-07-21",
        "dinner"
      ]
    ]
  },
  {
    "name": "ziti with fire-roasted tomatoes, pepperoni, smoked mozzarella",
    "tag": "pasta",
    "primaryProtein": "Pork",
    "source": "Pasta Revolution 204",
    "notes": "sub cavatappi; pasta 20 (could add 2 or 4) + other ingredients 2 [HOW TO DEAL WITH THIS FIBER NOTE MESS?]",
    "fiber": 22.0,
    "plannedDates": [
      [
        "2026-05-25",
        "dinner"
      ]
    ]
  },
  {
    "name": "scones, American",
    "tag": "breakfast",
    "primaryProtein": "None",
    "source": "",
    "notes": "made w/blueberries and raspberries; 2 scones/serving [1.7g fiber/pair + fiber from add-ins = 3.35]; recipes in Word as scones, American blueberry and scones, American base; ALSO: mango/dark chocolate and raspberry/dark chocolate (especially yummy); cherry and almond\nAdditional note (last-on-menu column 2): rasp/dark chocolate",
    "fiber": 3.35,
    "plannedDates": [
      [
        "2026-07-26",
        "breakfast"
      ]
    ]
  },
  {
    "name": "blackened salmon tacos w/avocado crema",
    "tag": "tortilla",
    "primaryProtein": "Other",
    "source": "Trejo 112 & more?",
    "notes": "3 tiny tacos = 19.5 + avo crema 3.35 tomatos & corn [optional cabbage]\nOriginal protein value from import: seafood",
    "fiber": 22.85,
    "plannedDates": [
      [
        "2026-08-15",
        "dinner"
      ],
      [
        "2026-07-28",
        "dinner"
      ]
    ]
  },
  {
    "name": "al pastor pizza",
    "tag": "pizza",
    "primaryProtein": "Pork",
    "source": "Pizza on a Plank 115",
    "notes": "",
    "fiber": 3.0,
    "plannedDates": [
      [
        "2026-06-11",
        "dinner"
      ]
    ]
  },
  {
    "name": "al pastor burritos",
    "tag": "tortilla",
    "primaryProtein": "Pork",
    "source": "Pizza on a Plank 115",
    "notes": "L tortilla = 18 + 1/4C black beans = 2.5 [filed under pizza]",
    "fiber": 20.5,
    "plannedDates": [
      [
        "2026-07-31",
        "dinner"
      ]
    ]
  },
  {
    "name": "southwest mango pizza",
    "tag": "pizza",
    "primaryProtein": "Chicken",
    "source": "mango.org",
    "notes": "rotisserie chicken breast; HAVE DUPLICATE",
    "fiber": 3.0,
    "plannedDates": [
      [
        "2026-08-02",
        "dinner"
      ]
    ]
  },
  {
    "name": "pesto cavatappi",
    "tag": "pasta",
    "primaryProtein": "Chicken",
    "source": "",
    "notes": "RECIPE TO BE SOURCED OR CREATED",
    "fiber": 20.0,
    "plannedDates": [
      [
        "2026-08-02",
        "dinner"
      ]
    ]
  },
  {
    "name": "burgers",
    "tag": "bun",
    "primaryProtein": "Beef",
    "source": "",
    "notes": "check current bun fiber (11) + toppings if applicable",
    "fiber": 11.0,
    "plannedDates": [
      [
        "2026-08-01",
        "dinner"
      ]
    ]
  },
  {
    "name": "Jack Allen's 13 spice chicken pasta [fettucine]",
    "tag": "pasta",
    "primaryProtein": "Chicken",
    "source": "Austin TX Jack Allen's menu description",
    "notes": "",
    "fiber": 20.0,
    "plannedDates": [
      [
        "2026-08-16",
        "dinner"
      ],
      [
        "2026-07-29",
        "dinner"
      ]
    ]
  },
  {
    "name": "Nashville hot chicken wraps",
    "tag": "tortilla",
    "primaryProtein": "Chicken",
    "source": "",
    "notes": "hot sauce, ranch dressing, cucumber, tomato [optional lettuce]\nFiber value in source spreadsheet was approximate: 18+",
    "fiber": 18.0,
    "plannedDates": [
      [
        "2026-08-14",
        "dinner"
      ],
      [
        "2026-07-30",
        "dinner"
      ]
    ]
  },
  {
    "name": "Firebird/fire chicken pasta",
    "tag": "pasta",
    "primaryProtein": "Chicken",
    "source": "defunct/have Word & PDF files",
    "notes": "penne HAVE DUPLICATE IN BIG BLACK NOTEBOOK",
    "fiber": 20.0,
    "plannedDates": [
      [
        "2026-07-27",
        "dinner"
      ]
    ]
  },
  {
    "name": "chorizo skillet",
    "tag": "breakfast",
    "primaryProtein": "Chicken",
    "source": "created",
    "notes": "GET INGREDIENTS FROM TOM/MAKE \"RECIPE\"",
    "fiber": 2.0,
    "plannedDates": [
      [
        "2026-07-25",
        "breakfast"
      ]
    ]
  },
  {
    "name": "biscuits & jam",
    "tag": "breakfast",
    "primaryProtein": "None",
    "source": "misc",
    "notes": "CHECK RASPBERRY SMUCKER'S PRESERVES FOR FIBER CONTENT",
    "fiber": 2.0,
    "plannedDates": [
      [
        "2026-07-19",
        "breakfast"
      ]
    ]
  },
  {
    "name": "creamy garlic pasta",
    "tag": "pasta",
    "primaryProtein": "Other",
    "source": "",
    "notes": "TWEAK: 7/26 chicken & mushroom rotini\u2014WAY too much parm for me [better w/scallops and angel hair? 7/17/26]\nOriginal protein value from import: seafood or chicken & mushroom",
    "fiber": 20.0,
    "plannedDates": [
      [
        "2026-07-26",
        "dinner"
      ]
    ]
  },
  {
    "name": "endless summer corn pizza",
    "tag": "pizza",
    "primaryProtein": "Pork",
    "source": "Epic Outdoor Pizza Oven 111-13 + Calabrian chili paste 171",
    "notes": "bacon",
    "fiber": 3.0,
    "plannedDates": [
      [
        "2026-07-20",
        "dinner"
      ]
    ]
  },
  {
    "name": "Jamaican jerk chicken pizza",
    "tag": "pizza",
    "primaryProtein": "Chicken",
    "source": "California Pizza Kitchen family cookbook (borrowed) 68, 70, 22, SEPARATE RUB RECIPE",
    "notes": "",
    "fiber": 3.0,
    "plannedDates": [
      [
        "2026-07-16",
        "dinner"
      ]
    ]
  },
  {
    "name": "Boston salmon & mashed potatoes",
    "tag": "side",
    "primaryProtein": "Other",
    "source": "Legal Seafood Boston menu",
    "notes": "Original protein value from import: seafood",
    "fiber": 1.5,
    "plannedDates": [
      [
        "2026-07-25",
        "dinner"
      ]
    ]
  },
  {
    "name": "mac & cheese",
    "tag": "pasta",
    "primaryProtein": "None",
    "source": "STILL SEARCHING FOR BEST",
    "notes": "TWEAK: Chef Bob Moreno's with mozzarella & harvarti was latest experiment 7/25/26\u2014couldn't find reel, but remembered cheeses and punted",
    "fiber": 20.0,
    "plannedDates": [
      [
        "2026-07-25",
        "dinner"
      ]
    ]
  },
  {
    "name": "honey-garlic shrimp",
    "tag": "pasta",
    "primaryProtein": "Other",
    "source": "allrecipes.com/recipe/282905 [MORE]",
    "notes": "angel hair I didn't like 8/6/26\u2014not sticky, smelled and tasted sort of nauseating (it or me?)\nOriginal protein value from import: seafood",
    "fiber": 20.0,
    "plannedDates": [
      [
        "2026-08-06",
        "dinner"
      ]
    ]
  },
  {
    "name": "dragonfire pizza",
    "tag": "pizza",
    "primaryProtein": "Pork",
    "source": "defunct food truck/restaurant menu description for dragon pizza + mushrooms from green pizza",
    "notes": "smoked Italian sausage; fiery green sauce & more\nNote on 2026-07-14 serving: possibly Debby's favorite!",
    "fiber": 3.0,
    "plannedDates": [
      [
        "2026-08-09",
        "dinner"
      ],
      [
        "2026-07-14",
        "dinner"
      ]
    ]
  },
  {
    "name": "lamb ragu w/cavatappi",
    "tag": "pasta",
    "primaryProtein": "Other",
    "source": "",
    "notes": "Original protein value from import: lamb",
    "fiber": 20.0,
    "plannedDates": [
      [
        "2026-08-13",
        "dinner"
      ],
      [
        "2026-07-23",
        "dinner"
      ]
    ]
  },
  {
    "name": "chorizo burritos w/black beans & rice",
    "tag": "tortilla",
    "primaryProtein": "Chicken",
    "source": "",
    "notes": "",
    "fiber": 21.5,
    "plannedDates": [
      [
        "2026-08-11",
        "dinner"
      ]
    ]
  },
  {
    "name": "penne w/fire-roasted tomato and red pepper sauce and scallops",
    "tag": "pasta",
    "primaryProtein": "Other",
    "source": "Pasta Revolution 193",
    "notes": "orig. no scallops. like less than some others?\nOriginal protein value from import: seafood\nAdditional note (last-on-menu column 2): ?",
    "fiber": null,
    "plannedDates": [
      [
        "2026-06-18",
        "dinner"
      ]
    ]
  },
  {
    "name": "kufta",
    "tag": "tortilla",
    "primaryProtein": "Other",
    "source": "",
    "notes": "option 1: medium tortilla 12, hummus 75g 5, cucumber 0.2, tomato 0.4, onion = 19.6\noption 2: large tortilla 18, tzatziki sauce 0, cucumber 0.2, tomato 0.4, onion 0.? = 18.6\nOriginal protein value from import: lamb, beef\nAdditional note (last-on-menu column 2): option 1",
    "fiber": null,
    "plannedDates": [
      [
        "2026-08-07",
        "dinner"
      ]
    ]
  },
  {
    "name": "Chipotle Steak and Queso Hash",
    "tag": "Other",
    "primaryProtein": "None",
    "source": "First Watch menu summer 2026",
    "notes": "Chipotle Steak and Queso Hash [figure out how to achieve at least 10g fiber between potatoes, pico, black beans, corn, onions, and avocado]\nCarne asada steak, house-roasted corn and onions, Cheddar and Monterey Jack and seasoned black beans in a potato hash. Topped with two cage-free eggs any style, fresh smashed avocado, housemade pico de gallo, lime crema and cilantro. Served with [SKIP: two wheat-corn tortillas and] a side of chipotle queso.",
    "fiber": null,
    "plannedDates": [
      [
        "2026-08-10",
        "dinner"
      ]
    ]
  },
  {
    "name": "chicken pomodori panini",
    "tag": "sammy",
    "primaryProtein": "Chicken",
    "source": "Corner Bakery D fave",
    "notes": "grilled chicken, provolone, basil, spinach, oven-roasted tomato, pesto aioli, grilled sourdough",
    "fiber": null,
    "plannedDates": []
  }
];

async function main() {
  let mealsCreated = 0;
  let plannedCreated = 0;

  for (const row of rows) {
    const meal = await prisma.meal.create({
      data: {
        ownerEmail,
        visibility: DEFAULT_VISIBILITY,
        name: row.name,
        tag: row.tag,
        primaryProtein: row.primaryProtein,
        primaryCarb: "None",
        minutes: 0,
        source: row.source,
        notes: row.notes,
        fiber: row.fiber,
        ingredients: "[]",
        instructions: "[]",
        components: "[]",
      },
    });
    mealsCreated += 1;

    for (const [date, mealType] of row.plannedDates) {
      await prisma.plannedMeal.create({
        data: { email: ownerEmail, date, mealType, mealId: meal.id },
      }).catch(async (err) => {
        // in case a row's date/mealType combo somehow gets created twice
        // within this run, don't let it abort the whole import
        console.warn(`  ! couldn't add planned entry for "${row.name}" on ${date}:`, err.message);
      });
      plannedCreated += 1;
    }

    console.log(`Created "${row.name}" (${row.plannedDates.length} planned date${row.plannedDates.length === 1 ? "" : "s"})`);
  }

  console.log(`\nDone. ${mealsCreated} meals created, ${plannedCreated} planned-meal entries created for ${ownerEmail}.`);
  await prisma.$disconnect();
}

main().catch(async (err) => {
  console.error(err);
  await prisma.$disconnect();
  process.exit(1);
});
