import { h } from 'preact';
import { useCallback, useState } from 'preact/hooks';
import { useTranslation } from 'react-i18next';

export default function ButtonsTabbed({
  viewModes = [''],
  setViewMode = null,
  setHeader = null,
  headers = [''],
  className = 'text-gray-600 py-0 px-4 block hover:text-gray-500',
  selectedClassName = `${className} focus:outline-none border-b-2 font-medium border-gray-500`,
}) {
  const { t } = useTranslation();
  const [selected, setSelected] = useState(0);

  const getHeader = useCallback(
    (i) => {
      return headers.length === viewModes.length ? headers[i] : t(viewModes[i]);
    },
    [headers, viewModes, t]
  );

  const handleClick = useCallback(
    (i) => {
      setSelected(i);
      setViewMode && setViewMode(viewModes[i]);
      setHeader && setHeader(getHeader(i));
    },
    [setViewMode, setHeader, setSelected, viewModes, getHeader]
  );

  setHeader && setHeader(getHeader(selected));
  return (
    <nav className="flex justify-end">
      {viewModes.map((item, i) => {
        return (
          <button key={i} onClick={() => handleClick(i)} className={i === selected ? selectedClassName : className}>
            {t(item)}
          </button>
        );
      })}
    </nav>
  );
}
