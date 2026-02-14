import { render, screen } from "@testing-library/react";
import App from "./App";

test("renders Stock Check header", () => {
  render(<App />);
  const title = screen.getByText(/Stock Check/i);
  expect(title).toBeInTheDocument();
});
