import { NavLink } from 'react-router-dom';

export function Tabs({ items }: { items: { to: string; label: string }[] }) {
  return (
    <nav className="mb-6 flex gap-1 overflow-x-auto shadow-[inset_0_-1px_0_var(--color-gray-200)] [scrollbar-width:none]">
      {items.map((i) => (
        <NavLink
          key={i.to}
          to={i.to}
          end
          className={({ isActive }) =>
            `border-b-2 px-3 py-2.5 text-sm font-medium whitespace-nowrap transition ${isActive ? 'border-brand-600 text-brand-600' : 'border-transparent text-gray-500 hover:border-gray-300 hover:text-gray-800'}`
          }
        >
          {i.label}
        </NavLink>
      ))}
    </nav>
  );
}
