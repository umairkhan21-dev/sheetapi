import Link from "next/link";

export default function Home() {
  return (
    <main className="min-h-screen bg-white text-zinc-900">
      {/* Navbar */}
      <nav className="mx-auto flex max-w-6xl items-center justify-between px-6 py-6">
        <div className="text-xl font-bold">
          Sheet<span className="text-blue-600">API</span>
        </div>

        <div className="flex items-center gap-4">
          <Link href="/login" className="text-sm text-zinc-600 hover:text-zinc-900">
            Login
          </Link>

          <Link href="/register" className="rounded-lg bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700">
            Get Started
          </Link>
        </div>
      </nav>

      {/* Hero */}
      <section className="mx-auto flex max-w-6xl flex-col items-center px-6 pb-24 pt-20 text-center">
        <div className="mb-6 rounded-full bg-blue-50 px-4 py-2 text-sm font-medium text-blue-600">
          Turn spreadsheets into REST APIs
        </div>

        <h1 className="max-w-4xl text-5xl font-bold tracking-tight sm:text-6xl">
          Your spreadsheet.
          <br />
          <span className="text-blue-600">Your API.</span>
        </h1>

        <p className="mt-6 max-w-2xl text-lg leading-8 text-zinc-600">
          Connect your Google Sheets and turn your spreadsheet data into a
          powerful REST API in minutes. No backend required.
        </p>

        <div className="mt-8 flex gap-4">
          <Link href="/register" className="rounded-lg bg-blue-600 px-6 py-3 font-medium text-white hover:bg-blue-700">
            Get Started
          </Link>

          <button className="rounded-lg border border-zinc-200 px-6 py-3 font-medium hover:bg-zinc-50">
            View Documentation
          </button>
        </div>

        {/* API Preview */}
        <div className="mt-16 w-full max-w-3xl overflow-hidden rounded-xl border border-zinc-200 bg-zinc-950 text-left shadow-xl">
          <div className="border-b border-zinc-800 px-5 py-3 text-sm text-zinc-400">
            Your API
          </div>

          <div className="p-6">
            <div className="mb-4 text-sm text-zinc-400">
              GET
            </div>

            <code className="text-sm text-green-400">
              https://api.sheetapi.dev/v1/products
            </code>

            <pre className="mt-6 overflow-x-auto text-sm leading-7 text-zinc-300">
{`[
  {
    "id": 1,
    "name": "Nike Shoes",
    "price": 2999
  },
  {
    "id": 2,
    "name": "Adidas Shirt",
    "price": 1999
  }
]`}
            </pre>
          </div>
        </div>
      </section>

      {/* How it works */}
      <section className="border-t border-zinc-100 bg-zinc-50 px-6 py-20">
        <div className="mx-auto max-w-6xl">
          <div className="text-center">
            <h2 className="text-3xl font-bold">
              From spreadsheet to API
            </h2>

            <p className="mt-3 text-zinc-600">
              Three simple steps.
            </p>
          </div>

          <div className="mt-12 grid gap-8 md:grid-cols-3">
            <div className="rounded-xl border border-zinc-200 bg-white p-6">
              <div className="text-sm font-semibold text-blue-600">
                01
              </div>

              <h3 className="mt-3 text-xl font-semibold">
                Connect your sheet
              </h3>

              <p className="mt-3 text-zinc-600">
                Connect your Google Sheet securely with your Google account.
              </p>
            </div>

            <div className="rounded-xl border border-zinc-200 bg-white p-6">
              <div className="text-sm font-semibold text-blue-600">
                02
              </div>

              <h3 className="mt-3 text-xl font-semibold">
                Create your API
              </h3>

              <p className="mt-3 text-zinc-600">
                Select your spreadsheet and create an API endpoint.
              </p>
            </div>

            <div className="rounded-xl border border-zinc-200 bg-white p-6">
              <div className="text-sm font-semibold text-blue-600">
                03
              </div>

              <h3 className="mt-3 text-xl font-semibold">
                Start building
              </h3>

              <p className="mt-3 text-zinc-600">
                Use your API in websites, apps, scripts, and other projects.
              </p>
            </div>
          </div>
        </div>
      </section>

      {/* Footer */}
      <footer className="border-t border-zinc-100 px-6 py-8">
        <div className="mx-auto max-w-6xl text-center text-sm text-zinc-500">
          © 2026 SheetAPI. All rights reserved.
        </div>
      </footer>
    </main>
  );
}