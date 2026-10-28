# Sheet Best homepage design

Reference: [sheetbest.com](https://sheetbest.com/), observed 23 October 2026 at a 1440px desktop width and a 506px phone width. This document records the marketing homepage so it can be rebuilt. It is a layout and visual specification, not a license to reuse customer quotes, logos, or brand assets.

The page is a long, single-column marketing scroll. White and pale green bands alternate with two solid green bands. Headlines use Lexend. Interface text uses a system sans (Inter is loaded). The accent is a leaf green. Primary actions are white text on a green pill.

## Page map

| Order | Anchor | Background | Role |
| --- | --- | --- | --- |
| 1 | Hero | White, with a soft green wash on the right | Promise, primary action, live sheet-to-JSON demo |
| 2 | Logo row | White | “Trusted by great teams” |
| 3 | `#tool-builders` | White fading into green-100 | Three reasons, then a green call to action |
| 4 | `#how-it-works` | Green-100 fading back to white | Three steps and a code sample |
| 5 | `#features` | Solid green-600 | Five product tabs with a demo panel |
| 6 | `#ai-prototyping` | Green-50 | Three AI-workflow cards |
| 7 | `#get-started-today` | Solid green-700 | Short close |
| 8 | `#template-hub` | Slate-50 through white into blue-50 | Template catalog |
| 9 | `#testimonials` | Slate-50 | Quote carousel |
| 10 | `#pricing` | White | Five plans and a monthly/annual switch |
| 11 | `#secondary-features` | White | Three use cases, repeated once as a second pass |
| 12 | `#faq` | White | Nine accordion questions |
| 13 | Close | Solid green-700 | Same close as section 7 |
| 14 | Footer | White | Link columns, social, language |

Content width is `max-w-7xl` (80rem) with 16px side padding on small screens, 24px from `sm`, and 32px from `lg`. Vertical section padding is 80px, growing to 128px from `sm`. The hero adds extra top padding: 96px, then 160px from `md`.

## Color

The page is built with Tailwind color names. These are the computed colors behind the important roles.

| Role | Token seen in the page | Computed color |
| --- | --- | --- |
| Page background | white | `#ffffff` |
| Headline | `text-slate-900` | `oklch(0.208 0.042 265.755)` |
| Nav and secondary text | slate | `oklch(0.372 0.044 257.287)` |
| Accent word and text links | `text-green-600` | `oklch(0.527 0.154 150.069)` |
| Link hover | `text-green-700` | darker green |
| Primary button start | green-500 | `oklch(0.627 0.194 149.214)` |
| Primary button end | green-600 | `oklch(0.527 0.154 150.069)` |
| Feature band | `bg-green-600` | `oklch(0.627 0.194 149.214)` |
| Close band | `bg-green-700` | darker green |
| Soft bands | `green-50`, `green-100` | pale green washes |
| Quiet surfaces | `bg-slate-50`, `oklch(0.968 0.007 247.896)` | near-white gray |
| Plan badge | — | `rgb(232, 245, 233)` |
| Template wash | `from-slate-50 via-white to-blue-50` | cool diagonal |

The primary button is not a flat fill. Its background is `linear-gradient(to right, green-500, green-600)`. It carries a green glow: two stacked shadows in the same green, about `0 10px 15px -3px` and `0 4px 6px -4px`, at 25% opacity.

Spreadsheet mock colors, from the class names on that component:

| Class | Use |
| --- | --- |
| `bg-sheet` | Column-letter and row-number cells |
| `border-cell` | Grid lines |
| `text-stone` | Muted chrome (letters, “Live”) |
| `text-graphite` | Formula bar and cell text |
| `bg-mint` / `text-green2` | Small green status chip |

## Type

| Use | Family | Size | Weight | Tracking |
| --- | --- | --- | --- | --- |
| Hero headline | Lexend Variable (`font-display`) | 48px, 72px from `sm` (`text-5xl sm:text-7xl`) | 500 | tight (`tracking-tight`, about -1.2px then -1.8px) |
| Hero line-height | Lexend | 56px, then about 79px | — | max width 640px |
| Section headlines | Lexend | about 48px on the green feature band | 400–500 | tight |
| Body | ui-sans-serif, system-ui (Inter is also loaded) | 16px | 400 | normal, 24px line |
| Buttons and nav | same sans | 14px | 600 on buttons, 400 on nav | normal |
| Sheet mock | monospace for the formula bar and JSON | 12px to 12.5px | 400–500 | — |

“Google Sheets” inside the hero headline is the same size and weight as the rest of the line, colored green-600. A hand-drawn green stroke sits under that phrase. The other lines stay slate-900: “Turn your” and “into REST APIs”.

The supporting line under the hero is slate, centered on small screens and left-aligned from `lg`: “Build websites, widgets, apps, prototypes, and tons more. Leave the backend to us.”

## Shape, elevation, and focus

- Primary actions are full pills (`rounded-full`): 12px vertical, 24px horizontal, 14px semibold.
- Secondary text actions have no fill. “Learn more →” is 14px semibold slate.
- Pricing “Get started” buttons are small rounded rectangles (`radius: 6px`, 8px by 12px). The featured plan uses the solid green fill and white text. The others use the quiet gray fill and slate text.
- Pricing cards use a 24px radius.
- The monthly/annual control is a pill. The selected side is green; the other side is quiet gray.
- Focus uses a 2px outline with offset. Do not remove it.
- Hover on green text links darkens from green-600 to green-700 in about 100ms.

## Header

Sticky is not required by the measured header. It is a transparent bar, about 8px of vertical padding, on the white page.

Desktop, left to right:

1. Logo: `<sheet.best/>`, with `sheet.best` in green and the brackets in a darker neutral. The link is named “Home”.
2. Text links: Features, Pricing.
3. Resources, a disclosure: Blog, MCP for AI assistants, Templates, Documentation.
4. Sign in, quiet text.
5. “Get started today”, the green gradient pill.

At 506px the links collapse behind a “Toggle navigation” button. The logo stays left and the menu button stays right. A “Skip to main content” link is the first focusable control.

A cookie dialog covers the hero on first visit: title, short explanation, a Privacy Policy link, four categories (Strictly necessary locked on, plus Performance, Targeting, Functionality), Accept all, Decline all, and Show details. Accept all is a pale green pill. Decline all is a white pill with a dark outline. The dialog is a large rounded card. It is not part of the page design once dismissed.

## Hero

Section class: `relative isolate overflow-hidden`. Inner frame: `max-w-7xl`, top padding 96px then 160px from `md`.

The copy column is `max-w-2xl`, centered until `lg`, then left-aligned. From `lg` the section becomes two columns (`lg:grid-cols-2`, 4rem horizontal gap). At `xl` the grid classes switch toward a single-column row template, while the demo remains the visual on the right in the live layout. Rebuild it as copy on the left and the product frame on the right from 1024px up. Stack the demo under the copy on smaller screens.

Actions, in a row with `gap-x-6`, centered until `lg`, then left-aligned:

- “Get started today” — gradient pill, white, semibold.
- “Learn more →” — text button, no pill.

Under the actions, a Product Hunt badge: a dark circular “P”, the words “Featured on Product Hunt”, and an upvote count (135 when observed). The badge is a light rounded rectangle with a thin border.

### Sheet-to-JSON frame

This is the signature visual. It reads as one floating product card, not a screenshot of Google Sheets.

Top of the sheet:

- Window title “customers.sheet — Google Sheets”.
- A green “Live” chip (`bg-mint`, `text-green2`, 11px).
- A formula bar labeled “A1” and `fx id`, in 12px mono (`text-graphite`) on a `border-cell` row.

The grid is five tracks: `32px 0.7fr 1.3fr 0.9fr 1fr`. Header cells use `bg-sheet`, `text-stone`, and `border-cell`. Column letters are A–D. Row 1 is the header `id`, `name`, `plan`, `joined`. Four data rows follow (Alan Turing / premium, Hedy Lamarr / personal, Dennis Ritchie / tiny, Barbara Liskov / professional). Row numbers sit in the first track. Body cells are white with hairline borders. One cell can show a selection outline so the sheet feels active.

Directly under or beside the sheet, a response card:

- Request line: `GET api.sheetbest.com/sheets/customers`.
- Status: “200 OK”.
- A JSON array of the same four people, string fields only, pretty-printed.
- Footer meta: elapsed time, row count, and `application/json` (observed as “184 ms · 4 rows”).

Keep the JSON visually tied to the highlighted sheet so the transformation is obvious without a caption.

## Logo row

Centered label: “Trusted by great teams”. Under it, a horizontal row of grayscale wordmarks. Observed alts: Uber Eats, Decathlon, Cornell University, Evercast, Braze. On small screens the row can wrap or scroll. Do not invent extra logos.

## Tool builders (`#tool-builders`)

Background: `bg-linear-to-b from-white to-green-100`, padding 80px / 128px.

Centered headline, broken across two lines: “Build your next website using Google Sheets as your database”. The break is a designed line break, not a wrap accident.

Three equal cards in `grid gap-8 md:grid-cols-3 lg:gap-12`. Each card is centered:

- Title row: a small icon plus a 20px semibold slate-900 title (`text-xl`).
- One sentence of body copy.
- A green text link with a trailing arrow.

The three cards are:

1. “A backend without the overhead” — link “Getting started guide”.
2. “Straightforward integration” — link “API reference”.
3. “Simple data management” — link, no admin panel required.

Below the cards, one centered sentence about skipping database setup, then a centered button row:

- “Start building” with a tool emoji, green pill.
- Reassurance line under it: “30-day free trial • Scale as you grow • Powering hundreds of projects”.

## How it works (`#how-it-works`)

Background: `bg-linear-to-b from-green-100 to-white`.

Eyebrow: “How it works”. Headline: “Get your API running in three simple steps”. A short deck says there is no backend to configure.

Three numbered steps, stacked on small screens and in a row on large screens:

1. Connect your sheet. Share a Google Sheet, or upload Excel or CSV. Link: “Generate your API”.
2. Get your API URL. The result is a REST endpoint for reads and writes.
3. Start building. Use it from apps, sites, or automation. Link: “Code examples”.

### Code panel

A tab list: JavaScript (selected), Python, Ruby, PHP. The selected tab is visually current; the others are quiet. The panel shows a `fetch` GET and POST against `https://api.sheetbest.com/sheets/your-sheet-id`. Other tabs show the same two calls in that language. The panel is a dark or neutral code block with horizontal scroll on small screens.

Under the panel, two links: “Start building today” and “Check out the documentation”. Reassurance: “30-day free trial • No credit card required • Setup in under 2 minutes”.

## Features (`#features`)

Full-bleed `bg-green-600`. Headline and deck are white. Headline at 48px Lexend, weight 400: “The best backend you’ll never code”. Deck: “Turn your spreadsheets into powerful REST APIs in seconds.”

Five tabs, in this order. The first tab starts selected.

1. Fast and powerful REST API
2. Granular access control
3. Request analytics and history
4. User interface templates
5. MCP for AI assistants

Each tab has a one-sentence description. The panel beside or below the tabs changes with the tab. White cards sit on the green field.

**REST tab.** Title “One sheet. A working API.” A small table named “Product inventory” with columns id, name, stock, price (Watch, Headphones, Desk lamp) and a “3 rows” caption. To the side, a request chip `GET` and the path `/sheets/example/stock/24`, then a “200 OK” JSON body for the matching row. Under the card, method chips: GET, POST, PATCH, PUT, DELETE.

**Access tab.** Copy about keys, IP allow lists, allowed methods, and CORS. The illustration alt is “Sheet Best connection methods and security controls, using demonstration data.”

**Analytics tab.** Copy about logs by method over time. The illustration alt is “Sheet Best request analytics, using demonstration data.”

**Templates tab.** “Your spreadsheet, on the page.” The same inventory table maps through an HTML snippet (`<h2>{{ name }}</h2>`, `<p>{{ price }}</p>`) into three product cards: name, price, “In stock”.

**MCP tab.** “Explore Sheet Best MCP”. A connection card shows the account tools as ready, an inventory sheet (“24 rows · live connection”), and a numbered tool list: list connections, check permissions, read rows, update rows. Footer chips: token protected, method aware, quota aware.

## AI band (`#ai-prototyping`)

Background `green-50`. Headline: “Build your backend in seconds”. Deck mentions prototyping with ChatGPT or Claude.

Three cards:

- AI-ready workflow — copy-paste snippets.
- Instant API generation — spreadsheet to endpoint in under 60 seconds.
- AI-generated data — generate rows, then connect the sheet.

Actions: “Start prototyping now” and “View quick start guide”. Line: “No credit card • Setup in 60 seconds • Perfect for MVP development”.

## Green close (`#get-started-today`)

`bg-green-700`, white type, about 128px vertical padding. Centered.

- Headline: “Ready to launch your API?”
- Deck: “It’s time to turn your Google Sheet into a backend.”
- Button: “Start free trial”, white pill, slate text. This is the inverted button. It is not the green gradient.

The same block is repeated after the FAQ.

## Templates (`#template-hub`)

Background: `bg-linear-to-br from-slate-50 via-white to-blue-50`.

Headline: “Ready-to-use templates”. Deck: forms, dashboards, and data-driven apps.

Four template cards in a wrapping grid. Each has an emoji, a category, a title, and one sentence.

| Emoji | Title | Category |
| --- | --- | --- |
| Form | Feedback forms | Customer support |
| Star | Testimonials | Marketing |
| Briefcase | Job board | HR and recruiting |
| Box | Inventory management | Operations |

Beside or below the cards, a “What are the templates?” list:

- Ready-to-use HTML and CSS
- One-line JavaScript
- No database setup
- Open source and customizable
- Mobile-responsive
- Documentation

A “Launch faster” note says the templates skip backend setup. Actions: “Explore templates” and “Start building”.

A code strip is labeled “Integration is this simple” and shows a script tag plus a form with `data-sheet-best`. Credit line links to the templating library on GitHub.

Closing line of the section: “Ready to build something amazing?” with “Browse all templates” and “Get started free”.

## Testimonials (`#testimonials`)

`bg-slate-50`. Centered headline “Loved by users worldwide” and a one-line deck about simplicity, performance, and support.

Quotes sit in a horizontal carousel. Each slide is a column of two or three quote cards. A card is a quotation, the person’s name, and a role. Do not copy the quotes into a new product. Use the structure: short quotation, name, role, previous/next controls if the row overflows.

## Pricing (`#pricing`)

White background. Centered headline “Simple pricing, for everyone.” Deck: “Predictable and affordable plans for every stage.”

The monthly/annual control is a two-part pill. Monthly starts selected. Annual changes the displayed prices. The amounts below are the monthly figures observed with Monthly selected.

Five cards in one row on a wide screen, wrapping below that. Cards are 24px radius. “Professional” is the featured card: a “Best value” label and a green “Get started” button. The other cards use the gray button. Tiny has a pale green pill, “MCP launch access”.

| Plan | Price | Notable items |
| --- | --- | --- |
| Tiny | $9.99/month | 30-day trial, 2 connections, 15,000 requests, Google Sheets, full CRUD, introductory MCP, self-serve |
| Personal | $19.99/month | Everything in Tiny, 8 connections, 50,000 requests, MCP included, 1 month of history, standard support |
| Professional | $39.99/month | 15 connections, 250,000 requests, 1 year of history, Google Drive, basic analytics, revocable key, method allow list, IP and domain allow list |
| Premium | $69.99/month | 35 connections, 500,000 requests, unlimited history, Excel upload, advanced analytics and queries, priority support |
| Production | from $149.99/month | 50 connections, 1,000,000 requests, add-on packages |

Under the cards, a launch note explains that MCP is included on Tiny for a limited time and normally starts at Personal. Link: “Learn about Sheet Best MCP”.

## Use cases (`#secondary-features`)

Headline: “Connect your spreadsheet to anything”. Three centered items, then the same three items repeated:

- Database — “No-code API backend”.
- CMS — “Easy content collaboration”.
- Data integrations — spreadsheets connected to other systems.

Treat the repeat as a marquee or a second static row, not as six different features.

## FAQ (`#faq`)

White. Headline “Frequently asked questions”. Deck points to support. The address published on the page is support@sheetbest.com.

Accordion, one question open at a time. Questions, in order:

1. What is Sheet Best?
2. What can I use Sheet Best for?
3. How do I read or write spreadsheet data?
4. Can I use Sheet Best with my existing tools?
5. How is Sheet Best different from other solutions?
6. Do you offer a free trial?
7. How secure is my data?
8. Can I use Excel files instead of Google Sheets?
9. How do I create a REST API from Google Sheets in three steps?

Below the accordion: “Still have questions?” with “View documentation” and “Contact support”.

Then the green close repeats.

## Footer

Four columns on desktop, stacked on small screens.

- Brand: “Sheet Best” and “The best backend you’ll never code.” Social: X (`https://x.com/sheetbest/`) and GitHub (`https://github.com/sheetbest/`).
- Product: MCP for AI assistants (`/mcp/`), Features (`/#features`), Testimonials (`/#testimonials`), Pricing (`/pricing/`).
- Resources: Documentation (`https://docs.sheetbest.com/`), Templates (`https://templates.sheetbest.com`), FAQ (`/#faq`).
- Company: Blog (`/blog/`).
- Legal: Privacy (`/privacy-policy/`), Terms (`/tos/`), Cancellation (`/policies/cancellation/`), Refunds (`/policies/refund/`).

A language control lists English, Español, and Português (Brasil). English is selected. Copyright line: “Copyright © 2020-2026 Sheet Best. All rights reserved.”

## Responsive behavior

| Width | Behavior |
| --- | --- |
| Under 768px | Single column. Hero type is 48px and centered. Header is logo plus menu button. Code samples scroll sideways. Pricing cards stack. Cookie dialog covers most of the viewport. |
| 768px to 1023px | Three-up cards where `md:grid-cols-3` applies. Hero can still be centered. |
| 1024px and up | Hero splits into copy and demo. Text aligns left. Header shows the full nav. |
| 1280px content | The `max-w-7xl` frame stops growing. Page background stays white. |

## Accessibility

- Skip link before the logo.
- Header menu button exposes expanded/collapsed state.
- Pricing frequency is a radio group, not two unrelated buttons.
- Feature choices are tabs, with one `selected`.
- FAQ questions are buttons or disclosures, not static headings.
- Cookie categories are checkboxes. Strictly necessary cannot be turned off.
- Color contrast on the green-600 and green-700 bands is white on green. Do not put slate-900 text on those bands.
- The green word in the hero is not conveyed by color alone. The underline and the sentence still read if the green is removed.

## Rebuild notes

Build the page as one route with the anchors above. Reuse the pill button, the inverted white pill, the green text link, the sheet mock, the code tabs, the pricing card, and the green close. Do not add a dashboard, billing logic, or API behavior in this document. Those belong to the product, not this homepage.

When this layout is adapted for another name, replace the logo, the sample host, the customer logos, the testimonials, and the prices. Keep the section order, the green-on-white rhythm, the Lexend headlines, and the sheet-beside-JSON hero.
