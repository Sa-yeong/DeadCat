import './SearchBar.css'
import React from 'react';
import { SlMagnifier } from "react-icons/sl";

interface SearchBarProps{
    placeholder?: string;
    onAdd?: (str: string) => void;
}

export function SearchBar({ placeholder = "종목 검색", onAdd }: SearchBarProps){
    const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
        if(e.key === 'Enter'){
            const inputValue = e.currentTarget.value;
            if(inputValue.trim() === '') return;

            if(onAdd){
                onAdd(inputValue);
                e.currentTarget.value = '';
            }
        }
    };

    return <span className='search-bar'>
        <SlMagnifier />
        <input type="text" placeholder={placeholder} aria-label="종목 검색" onKeyDown={handleKeyDown} />
    </span>;
}
