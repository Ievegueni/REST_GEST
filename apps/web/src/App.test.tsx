import { render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { describe, expect, it } from 'vitest';
import { App } from './App';

describe('App', () => {
  it('renderiza layout com menu e página activa', () => {
    render(
      <MemoryRouter initialEntries={['/stock']}>
        <App />
      </MemoryRouter>,
    );
    expect(screen.getByRole('heading', { name: 'Stock' })).toBeTruthy();
    expect(screen.getByRole('link', { name: 'Compras' })).toBeTruthy();
    expect(screen.getByRole('combobox')).toBeTruthy();
  });
});
