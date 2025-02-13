//INFO: db as static data

//S: v2
function hash_str(s) {
  let hash = 0;
  for (let i = 0; i < s.length; i++) {
    let chr = s.charCodeAt(i);
    hash = ((hash << 5) - hash) + chr;
		hash |= 0; //A: Convert to 32bit integer
  }
	return (hash>>>0).toString(16);
}
//console.log("HASH",hash_str('pepe@x.com')) //XXX:hash emails, don't leak to the web!

function col_norm(s,n,hashSensible=true) {
	let sn= String(s||'').replace(/[\t\r\n]+/gs,' ').trim();
	return (hashSensible && n=='email' && sn!='') ? hash_str(sn) : sn;	
}

function expand_rel1(kv) {
	Object.entries(kv).forEach( ([k,v]) => { if (v==null) return;
		let col_k= k.replace(/(_[ab])?_id$/,'');
		//DBG: 
		console.log("expand_rel1",{k,v,col_k});
		if (col_k==k) return;
		let col= D[col_k] || D.personas;
		kv[k.replace(/_id$/,'')]= col[v];
	});
	return kv;
}

function expand_relM(rel_l,col_k,rel_k,dst_k,src_k) {
	dst_k= dst_k || rel_k;
	src_k= src_k || (rel_k+'_id');
	rel_l.forEach( kv => {
		let pk= kv[col_k+'_id']
		let p= D[col_k][pk];
		if (!p) { //DBG: console.log("XXX:DST",col_k,pk,kv[pk], kv); 
			return; 
		}
		p[dst_k] ||= {};
		p[dst_k][ kv[src_k] ]= D[rel_k][ kv[src_k] ];
	});
}

function expand_rels(id_norm_col='id') {
	//DBG: console.log(D.productos)
	//DBG: console.log(D.productos_tiene_autores);
	expand_relM(D.productos_tiene_autores,'productos','personas','autores');
	//DBG: console.log(JSON.stringify(D.productos,0,2))

	Object.values(D.proyectos).forEach(expand_rel1);
	expand_relM(D.proyectos_tiene_financiamientos,'proyectos','financiamientos');
	expand_relM(D.proyectos_tiene_integrantes,'proyectos','personas','integrantes');

	Object.values(D.productos).forEach(p => {
		p.tipos_de_productos= D.tipos_de_productos[p.tipos_de_productos_id];
	});
	expand_relM(Object.values(D.productos),'proyectos','productos','publicaciones',id_norm_col);
}

function form_query_norm() {
	let f= document.querySelector('form')
	let d= new FormData(f)
	let dd= {}; for (k of d.keys()) { 
		let vs= d.getAll(k); 
		if (vs.find(e => e!='')) {
			let knorm= k.replace('Buscador[','').replace(/[\[\]]+/g,'');
			if (knorm.match(/(esries)|(espandemia)|(recomendaciones_politicas)/)) {
				if (Math.max(...vs)==1) { dd[knorm]= ["1"] }
			} else {
				dd[knorm]= vs
			}
		} 
	}
	return dd;
}

D={};

function tsv_src_to_t(tsv_src) {
	x= tsv_src.split(/##COL##(.+)/)
	for (let i=1;i<x.length;i+=2) {
		D[x[i]]= x[i+1].split('\n').map(l => l.split('\t'));
	}
	//DBG: console.log(Object.keys(D))
	return D;
}

function expand_col(col_name,elements, idToCol, indexKey) {
	let col= D[col_name];
	let cols= col[1];
	elements= elements || col;
	let indexed= {};
	let values= elements.map(row => {
		let kv= Object.assign({},...(cols.map( (c,i) => ({[c]: row[i]}) )))
		if (idToCol) { Object.entries( idToCol ).forEach( ([k,col]) => {
			kv[k]= col[kv[k+'_id']];
		}) }
		if (indexKey) indexed[kv[indexKey]]= kv;
		return kv;
	});
	return (indexKey ? indexed : values);
}

function query_inrel(q, rels, idsOk) {
	Object.entries(rels).forEach( ([qk,krel]) => { let l= q[qk]; if (l) { 
		let p0= idsOk, col= D[krel]; idsOk= {}; //DBG: console.log(col[1]); //XXX:id vs v?
		col.forEach(row => { let [id,v]= row; //DBG: console.log({id,v,idx: l.indexOf(v), t: !p[id], p:(p0==null || p0[id]) });
			if ( (!idsOk[id]) && (p0==null || p0[id]) && l.indexOf(v)>-1) { idsOk[id]=1; }
		}); //DBG: 
		//DBG: console.log(qk,krel,l,idsOk);
	}});
	return idsOk;
}

function query_colq(q, qdef, cols) {
	let colq=[];
	for (let k in qdef.eq) {
		if (q[k] && q[k].indexOf("1")>-1) {
			let idx= cols.indexOf(qdef.eq[k]);
			colq.push([idx, 'eq', 'S']);
		}
	}
	for (let k in qdef.inlist) {
		if (q[k]) {
			let idx= qdef.inlist[k].map(colk => cols.indexOf(colk)); //A:OR
			colq.push([idx, 'in', q[k]]);
		}
	}
	for (let k in qdef.txt) { //DBG: console.log("COLQ txt",k,q[k]);
		if (q[k] && q[k].length>0 && q[k][0]) {
			let s= q[k][0].toLowerCase().trim()
			let idx= cols.indexOf(qdef.txt[k]); 
			colq.push([idx, 'like', s]);
		}
	}
	//DBG: console.log("COLQ",colq);
	return colq;
}

function query_bycolq(col,colq,idsOk) {
	let p0= idsOk; p= {}; 
	col.slice(2).forEach( pj => {
		if (p0!=null && p0[pj[0]]==null) return 'NO_P0';
		for (let i=0; i<colq.length; i++) { let [idx, op, v]= colq[i];
			if (op=='in') { if (! idx.find(idxi => v.indexOf(pj[idxi])>-1)) { return 'NO_'+idx+'_IN' } }
			else if (op=='eq' && pj[idx]!=v) { return 'NO_'+idx+'_eq_'+v }
			else if (op=='like' && (pj[idx]||'').toLowerCase().indexOf(v)==-1){ return 'NO_'+idx+'_like_'+v }
		}
		p[pj[0]]= pj; //console.log(pj);
	});
	return p;
}

function flatten_values(kv) {
	return Object.values(kv).map( v => (
		typeof(v)=='object' ? flatten_values(v) : String(v) //A: KISS
	)).join(' | ').toLowerCase();
}

function query_bywords(kv,w) {
	let r= {}; Object.entries(kv).forEach( ([ek,ev]) => {
		//DBG: console.log("query_bywords ev",ev)
		Object.values(ev).every( v => {
			let vs= (typeof(v)=='object' ? flatten_values(v) : String(v)).toLowerCase(); //A: KISS
			//DBG: console.log("query_bywords",vs,v,w)
			if (w.find(aw => vs.indexOf(aw)>-1)) { r[ek]= ev; return false; } //A: found, add to result, end "every"
			return true;
		});
	});
	return r;
}

function query(q) {
	//DBG: console.log("query",JSON.stringify(q,0,2))

	QDEF= {
		pj: {
			inrel: {
				financiamientos: 'proyectos_tiene_financiamientos',
				integrantes: 'proyectos_tiene_integrantes',
			},
			eq: { esriesproy: 'esries' }, 
			inlist: {
				directores: ['director_id'],
				instituciones: ['instituciones_id'],
				region: ['regiones_educativas_id'],
				cpres: ['cpres_id'],
				tipo_de_gestion: ['gestion_id'],
				clasificacion: ['clasificaciones_a_id', 'clasificaciones_b_id'],
				sub_clasificacion: ['subclasificaciones_a_id', 'subclasificaciones_b_id'],
			},
			txt: {
				titulo_proyecto: 'titulo',
			},
		},
		pu: {
			inrel: {
				autores: 'productos_tiene_autores',
			},
			eq: {
				esries: 'esries',
				esriesproy: 'esries', //A:esriesproj->prod debe tener proj.esries o prod.esries
				espandemia: 'espandemia',
				recomendaciones_politicas: 'recomendaciones_politicas',
			},
			inlist: {
				tipo_de_publicacion: ['tipos_de_productos_id'],
			},
			txt: {
				titulo_publicacion: 'titulo',
				autor_institucional: 	'autor_institucional',
				en: 'en',
				autores_libro: 'autores_libro',
				nro_y_vol_revista: 'numero_y_volumen_revista',
				editorial: 'editorial',
				ciudad: 'ciudad',
				isbn: 'isbn',
				issn: 'issn',
				ano_edicion: 'ano_edicion',
			},
		}
	};

	//S: PROD {
	let puIdsOk= null;
	puIdsOk= query_inrel(q, QDEF.pu.inrel, puIdsOk);

	let cols_pu= D.productos[1]; 
	let colq_pu= query_colq(q, QDEF.pu, cols_pu);
	puIdsOk= query_bycolq(D.productos, colq_pu, puIdsOk);
	//S: PROD }
	
	//S: PROJ {
	//XXX:esries,espandemia,recomendaciones_politicas->proj debe tener prod
	let pjIdsOk= null; //DFLT;
	if (['esries','espandemia','recomendaciones_politicas'].find(k => q[k] && q[k][0]=="1")) { //A: proj debe tener prod
		pjIdsOk= {}; Object.values(puIdsOk).forEach(pu => pjIdsOk[pu[1]]= 1);
	}

	pjIdsOk= query_inrel(q, QDEF.pj.inrel, pjIdsOk);

	let cols_pj= D.proyectos[1]; 
	let colq_pj= query_colq(q, QDEF.pj, cols_pj);
	pjIdsOk= query_bycolq(D.proyectos, colq_pj, pjIdsOk);
	//S: PROJ }

	//S: EXPAND {
	D.personas_kv= D.personas_kv || expand_col('personas',null,null,'id');
	D.instituciones_kv= D.instituciones_kv || expand_col('instituciones',null,null,'id');
		
	pu_kv= expand_col('productos', Object.values(puIdsOk), {},'id');
	D.productos_tiene_autores.forEach( ([pu_id,pe_id]) => { let pu=pu_kv[ pu_id ];
		if (pu) { (pu.autores ||= {})[pe_id]= D.personas_kv[pe_id]; }
	});

	pj_kv= expand_col('proyectos', Object.values(pjIdsOk), {director: D.personas_kv, instituciones: D.instituciones_kv},'id');
	//S: EXPAND }

	let cnt_pj= Object.keys(pj_kv).length; //DBG: console.log('pj_kv pre_cross',pj_kv);
	let cnt_pu= Object.keys(pu_kv).length; //DBG: console.log('pu_kv pre_cross',pu_kv);
	if (cnt_pu> D.productos.length-3) { //A: no habia filtrado prods
		let p0= pu_kv; pu_kv= {};
		Object.entries(p0).forEach( ([k,v]) => { if (pj_kv[v.proyectos_id]) { pu_kv[k]= v } })
	} else if (cnt_pj > D.proyectos.length-3) {//A: no habia filtrado proJs
		let p0= pj_kv; pj_kv= {};
		Object.entries(pu_kv).forEach( ([k,v]) => { let pj= p0[v.proyectos_id]; if (pj) { pj_kv[v.proyectos_id]= pj } })
	}
	
	//S: QUERY {
	if (q.query) {
		let w= []; q.query[0].toLowerCase()
			.replace(/"([^"]*)\"/gsi, (_,qq) => { w.push(qq); return '' })
			.replace(/\S+/gsi, (qq) => { w.push(qq); return '' });
		//DBG: console.log("query w",w);
		pu_kv= query_bywords(pu_kv,w);
		pj_kv= query_bywords(pj_kv,w);
	}

	//S: QUERY }

	cnt_pj= Object.keys(pj_kv).length; console.log("FINAL PROJ",cnt_pj,pj_kv);
	cnt_pu= Object.keys(pu_kv).length; console.log("FINAL PROD",cnt_pu,pu_kv);

	return { 
		proyectos: Object.values(pj_kv),
		productos: Object.values(pu_kv), 
	};
}

/*
 * PROYECTOS: id  director_id titulo  resumen instituciones_id  unidad_academica  clasificaciones_a_id  subclasificaciones_a_id clasificaciones_b_id  subclasificaciones_b_id gestion_id  cpres_id  regiones_educativas_id  ano_inicio  status  esries
 * PRODUCTOS: id  proyectos_id  tipos_de_productos_id autor_institucional ano_edicion titulo  en  autores_libro numero_y_volumen_revista  editorial ciudad  isbn  issn  paginas nombre_adjunto  url_adjunto resumen palabras_claves recomendaciones_politicas clasificacion status  espandemia  esries 

  "query": [ "ingrese su busqueda" ],

  "titulo_proyecto": [ "titulo de la investigacion" ], pj.titulo
	"autor_institucional": [ "autor institucional" ], pu.autor_institucional
  "titulo_publicacion": [ "titulo de la publicacion" ], pu.titulo
	"en": [ "editado en" ], pu.en
  "autor_libro": [ "autor del libro" ], pu.autores_libro
  "nro_y_vol_revista": [ "no y vol revista" ], pu.numero_y_volumen_revista
  "editorial": [ "editorial" ], pu.editorial
  "ciudad": [ "ciudad publicacion" ], pu.ciudad
  "isbn": [ "isbn" ], pu.isbn
  "issn": [ "issn" ] pu.issn

	SI FILTRO PROYECTOS, usar los ids para filtrar productos!

*/

example_q= { 
	//financiamientos: ['c','i','o','p'],
	//integrantes: [ "852", "4648" ],
	esriesproy: ["0","1"],
}

DbData2= null;
async function db_data2() {
	if (DbData2==null) {
		DbData2= tsv_src_to_t(	DB_DATA_TXT || 
			(await fetch('/data/datajsonp.js').then(res => res.text()))
				.replace(/^.*?=`/,'').replace(/`/,'')
		);
		DB_DATA_TXT=null;
	}
	return DbData2 
}

if (globalThis.window) db_data2();
