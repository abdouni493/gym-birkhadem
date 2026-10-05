import React, { useState, useRef, useEffect, useMemo } from 'react';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { ChevronDown, Check, Search } from 'lucide-react';

/** Minimal supplier shape this input needs — decoupled from any data layer. */
interface Supplier {
  id: string;
  name: string;
  phone?: string | null;
}

interface SupplierSearchInputProps {
  suppliers: Supplier[];
  value: string;
  onSelect: (supplier: Supplier) => void;
  placeholder?: string;
  label?: string;
  required?: boolean;
}

export const SupplierSearchInput: React.FC<SupplierSearchInputProps> = ({
  suppliers,
  value,
  onSelect,
  placeholder = 'Search supplier...',
  label = 'Supplier',
  required = false,
}) => {
  const [searchTerm, setSearchTerm] = useState('');
  const [isOpen, setIsOpen] = useState(false);
  const [selectedSupplier, setSelectedSupplier] = useState<Supplier | null>(null);
  const dropdownRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  // Filter suppliers based on search term
  const filteredSuppliers = useMemo(() => {
    if (!searchTerm.trim()) return suppliers;
    
    const term = searchTerm.toLowerCase();
    return suppliers.filter(supplier =>
      supplier.name.toLowerCase().includes(term) ||
      supplier.id?.toLowerCase().includes(term) ||
      supplier.phone?.toLowerCase().includes(term)
    );
  }, [searchTerm, suppliers]);

  // Auto-select if only one match
  useEffect(() => {
    if (searchTerm.trim() && filteredSuppliers.length === 1 && !selectedSupplier) {
      const supplier = filteredSuppliers[0];
      setSelectedSupplier(supplier);
      onSelect(supplier);
      setSearchTerm(supplier.name);
      setIsOpen(false);
    }
  }, [searchTerm, filteredSuppliers, selectedSupplier, onSelect]);

  // Handle click outside
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (dropdownRef.current && !dropdownRef.current.contains(event.target as Node)) {
        setIsOpen(false);
      }
    };

    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  const handleInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    setSearchTerm(e.target.value);
    setIsOpen(true);
    setSelectedSupplier(null);
  };

  const handleSelectSupplier = (supplier: Supplier) => {
    setSelectedSupplier(supplier);
    setSearchTerm(supplier.name);
    onSelect(supplier);
    setIsOpen(false);
  };

  const handleInputFocus = () => {
    setIsOpen(true);
  };

  return (
    <div className="space-y-2">
      <Label className="text-gym-gold flex items-center gap-1">
        {label}
        {required && <span className="text-red-400">*</span>}
      </Label>
      
      <div className="relative" ref={dropdownRef}>
        <div className="relative flex items-center">
          <Search className="absolute left-3 w-4 h-4 text-gym-gold/40" />
          <Input
            ref={inputRef}
            type="text"
            value={searchTerm}
            onChange={handleInputChange}
            onFocus={handleInputFocus}
            placeholder={placeholder}
            className="pl-10 pr-10 gym-input"
          />
          <ChevronDown
            className={`absolute right-3 w-4 h-4 text-gym-gold/40 transition-transform ${
              isOpen ? 'rotate-180' : ''
            }`}
          />
        </div>

        {/* Dropdown */}
        {isOpen && (
          <div className="absolute z-50 w-full mt-2 bg-gym-gray border border-gym-gold/30 rounded-lg shadow-2xl overflow-hidden">
            {filteredSuppliers.length > 0 ? (
              <div className="max-h-64 overflow-y-auto">
                {filteredSuppliers.map((supplier, index) => (
                  <button
                    key={supplier.id}
                    onClick={() => handleSelectSupplier(supplier)}
                    className={`w-full text-left px-4 py-3 hover:bg-gym-gold/15 transition-colors flex items-center justify-between group ${
                      index !== filteredSuppliers.length - 1 ? 'border-b border-gym-gold/10' : ''
                    } ${selectedSupplier?.id === supplier.id ? 'bg-gym-gold/10' : ''}`}
                  >
                    <div>
                      <div className="font-semibold text-gym-gold">{supplier.name}</div>
                      <div className="text-xs text-gym-gold/60 flex gap-3 mt-1">
                        {supplier.phone && (
                          <span>{supplier.phone}</span>
                        )}
                      </div>
                    </div>
                    {selectedSupplier?.id === supplier.id && (
                      <Check className="w-4 h-4 text-gym-gold flex-shrink-0" />
                    )}
                  </button>
                ))}
              </div>
            ) : (
              <div className="px-4 py-6 text-center">
                <p className="text-gym-gold/60 text-sm">No suppliers found</p>
                <p className="text-gym-gold/40 text-xs mt-1">Try a different search term</p>
              </div>
            )}
          </div>
        )}

        {/* Selected indicator */}
        {selectedSupplier && !isOpen && (
          <div className="text-xs text-gym-gold/70 mt-2 p-2 bg-gym-gold/5 rounded border border-gym-gold/20">
            <strong className="text-gym-gold">Selected:</strong> {selectedSupplier.name}
          </div>
        )}
      </div>
    </div>
  );
};
