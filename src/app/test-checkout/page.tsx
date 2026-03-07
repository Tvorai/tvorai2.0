"use client"

export default function TestCheckoutPage() {
  const handleCheckout = async () => {
    const res = await fetch("/api/stripe/create-checkout-session", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        userId: "11111111-1111-1111-1111-111111111111",
        email: "test@example.com",
      }),
    })

    const data = await res.json()

    if (data.url) {
      window.location.href = data.url
    } else {
      console.error(data)
      alert("Nepodarilo sa vytvoriť checkout session")
    }
  }

  return (
    <div style={{ padding: "40px", color: "white" }}>
      <h1>Test Stripe Checkout</h1>
      <button
        onClick={handleCheckout}
        style={{
          marginTop: "20px",
          padding: "10px 20px",
          background: "#00C8D7",
          border: "none",
          borderRadius: "8px",
          cursor: "pointer",
          fontWeight: "bold",
        }}
      >
        Kúpiť plán
      </button>
    </div>
  )
}
