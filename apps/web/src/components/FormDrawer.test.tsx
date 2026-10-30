import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { categoryTree } from '../modules/types';
import { FormDrawer } from './FormDrawer';

describe('FormDrawer', () => {
  it('converte número vazio e select vazio em null', async () => {
    const onSubmit = vi.fn().mockResolvedValue(undefined);
    render(
      <FormDrawer
        title="T"
        fields={[
          { key: 'name', label: 'Nome' },
          { key: 'days', label: 'Dias', type: 'number' },
          { key: 'max', label: 'Máx', type: 'number' },
          { key: 'parentId', label: 'Pai', type: 'select', options: [{ value: 'a', label: 'A' }] },
          { key: 'active', label: 'Activo', type: 'checkbox' },
        ]}
        initial={{ name: 'X', days: 30 }}
        onSubmit={onSubmit}
        onClose={() => {}}
      />,
    );
    fireEvent.submit(screen.getByRole('button', { name: 'Guardar' }));
    await vi.waitFor(() => expect(onSubmit).toHaveBeenCalled());
    expect(onSubmit.mock.calls[0]![0]).toEqual({
      name: 'X',
      days: 30,
      max: null,
      parentId: null,
      active: false,
    });
  });
});

describe('categoryTree', () => {
  it('ordena por caminho com profundidade', () => {
    const tree = categoryTree([
      { id: '2', name: 'Cervejas', parentId: '1', active: true },
      { id: '3', name: 'Alimentos', parentId: null, active: true },
      { id: '1', name: 'Bebidas', parentId: null, active: true },
    ]);
    expect(tree.map((c) => [c.path, c.depth])).toEqual([
      ['Alimentos', 0],
      ['Bebidas', 0],
      ['Bebidas > Cervejas', 1],
    ]);
  });
});
