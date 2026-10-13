export function baixarJson(nome: string, obj: unknown) {
  const a = document.createElement('a');
  a.href = URL.createObjectURL(new Blob([JSON.stringify(obj, null, 2)], { type: 'application/json' }));
  a.download = nome; a.click(); URL.revokeObjectURL(a.href);
}
