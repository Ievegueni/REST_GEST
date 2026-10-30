import { NavLink } from 'react-router-dom';

export function Tabs({ items }: { items: { to: string; label: string }[] }) {
  return (
    <nav className="mb-6 flex gap-1 border-b">
      {items.map((i) => (
        <NavLink
          key={i.to}
          to={i.to}
          end
          className={({ isActive }) =>
            `-mb-px border-b-2 px-3 py-2 text-sm ${isActive ? 'border-slate-900 font-medium' : 'border-transparent text-slate-500 hover:text-slate-900'}`
          }
        >
          {i.label}
        </NavLink>
      ))}
    </nav>
  );
}
