import { Link } from 'react-router-dom';

export default function Navbar() {
  return (
    <header className="bg-brand-navy shadow-lg">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 h-16 flex items-center justify-between">
        <Link to="/" className="flex items-center gap-3">
          {/* Kenya flag stripe accent */}
          <div className="flex flex-col gap-0.5">
            <div className="w-6 h-1 bg-black rounded-full" />
            <div className="w-6 h-1 bg-risk-red rounded-full" />
            <div className="w-6 h-1 bg-risk-green rounded-full" />
          </div>
          <div>
            <span className="text-white font-bold text-lg tracking-tight">VoteTrace</span>
            <span className="text-blue-400 font-bold text-lg">360</span>
          </div>
        </Link>
        <span className="text-gray-400 text-sm hidden sm:block">
          Kenya Campaign Spending Transparency
        </span>
      </div>
    </header>
  );
}
