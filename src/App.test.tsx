import { fireEvent, render, screen } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import App from './App'

describe('App component', () => {
  it('renders correctly with heading and counter button', () => {
    render(<App />)

    const headingElement = screen.getByRole('heading', { level: 1, name: /get started/i })
    expect(headingElement).toBeInTheDocument()

    const buttonElement = screen.getByRole('button', { name: /count is 0/i })
    expect(buttonElement).toBeInTheDocument()
  })

  it('increments counter on click', () => {
    render(<App />)
    const button = screen.getByRole('button', { name: /count is/i })
    fireEvent.click(button)
    expect(button).toHaveTextContent(/count is 1/i)
  })
})
